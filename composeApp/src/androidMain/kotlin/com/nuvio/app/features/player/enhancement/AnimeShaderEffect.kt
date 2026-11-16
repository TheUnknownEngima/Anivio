package com.nuvio.app.features.player.enhancement

import android.content.Context
import android.app.ActivityManager
import android.opengl.GLES20
import android.opengl.GLES30
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import com.nuvio.app.features.player.EnhancementStatus
import com.nuvio.app.features.player.VideoEnhancement
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** All GL creation, rendering and disposal is owned by Media3's GL thread. */
@androidx.annotation.OptIn(UnstableApi::class)
internal class AnimeShaderEffect(
    private val mode: VideoEnhancement,
    private val display: ShaderSize,
    private val onStatus: (EnhancementStatus) -> Unit,
) : GlEffect {
    override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
        AnimeShaderProgram(context.applicationContext, mode, display, useHdr, onStatus)
}

@androidx.annotation.OptIn(UnstableApi::class)
internal class AnimeShaderProgram(
    private val context: Context,
    private val mode: VideoEnhancement,
    private val display: ShaderSize,
    private val hdr: Boolean,
    private val onStatus: (EnhancementStatus) -> Unit,
) : BaseGlShaderProgram(hdr, 1) {
    private data class Target(val texture: Int, val fbo: Int)
    private var graph: ShaderGraph? = null
    private val programs = mutableListOf<Program>()
    private val targets = mutableListOf<Target>()
    private val copy = Program(COPY_FRAGMENT, modern = false)
    private val memoryBudget = if ((context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.isLowRamDevice == true)
        32L * 1024 * 1024 else MAX_BYTES
    private var input = ShaderSize(1, 1)
    private var frame = 0
    private var lastTimeUs = 0L
    private var reported: EnhancementStatus? = null
    private var failed = false
    private val speed = EnhancementPerformanceGuard()

    private fun report(status: EnhancementStatus) {
        if (reported != status) { reported = status; onStatus(status) }
    }

    override fun configure(inputWidth: Int, inputHeight: Int): Size {
        clearPipeline()
        input = ShaderSize(inputWidth, inputHeight)
        if (failed) return Size(inputWidth, inputHeight)
        if (hdr) { report(EnhancementStatus.Hdr); return Size(inputWidth, inputHeight) }
        val version = GLES20.glGetString(GLES20.GL_VERSION).orEmpty()
        val extensions = GLES20.glGetString(GLES20.GL_EXTENSIONS).orEmpty()
        if (!version.contains("OpenGL ES 3.") ||
            (!extensions.contains("GL_EXT_color_buffer_half_float") && !extensions.contains("GL_EXT_color_buffer_float"))) {
            report(EnhancementStatus.Unsupported)
            return Size(inputWidth, inputHeight)
        }
        val output = enhancementOutputSize(input, display, mode != VideoEnhancement.Light)
        val previousFbo = IntArray(1).also { GLES20.glGetIntegerv(GLES20.GL_FRAMEBUFFER_BINDING, it, 0) }[0]
        try {
            val sources = mode.shaders.map { name -> context.assets.open("video_enhancement/$name").bufferedReader().use { it.readText() } }
            val plan = buildShaderGraph(sources, input, output)
            if (plan == null) { report(EnhancementStatus.NotNeeded); return Size(inputWidth, inputHeight) }
            val maxTexture = IntArray(1).also { GLES20.glGetIntegerv(GLES20.GL_MAX_TEXTURE_SIZE, it, 0) }[0]
            if (plan.estimatedBytes(input) > memoryBudget || plan.slots.any { maxOf(it.width, it.height) > maxTexture }) {
                report(EnhancementStatus.MemoryLimit)
                return Size(inputWidth, inputHeight)
            }
            // Validate and allocate everything before allowing an enhanced frame to be shown.
            plan.nodes.forEach { node -> programs += Program(fragment(node), modern = true) }
            plan.slots.forEach { size -> targets += createTarget(size) }
            graph = plan
            frame = 0
            return Size(output.width, output.height)
        } catch (error: Exception) {
            Log.w(TAG, "Enhancement initialization failed for $mode", error)
            failed = true
            clearPipeline()
            report(EnhancementStatus.Failed)
            return Size(inputWidth, inputHeight)
        } finally {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, previousFbo)
        }
    }

    override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
        val plan = graph
        if (plan == null || failed) { copy.draw(mapOf("INPUT" to Texture(inputTexId, input))); return }
        val outputFbo = IntArray(1).also { GLES20.glGetIntegerv(GLES20.GL_FRAMEBUFFER_BINDING, it, 0) }[0]
        val viewport = IntArray(4).also { GLES20.glGetIntegerv(GLES20.GL_VIEWPORT, it, 0) }
        val sample = frame > 4 && frame % 30 == 0
        val started = if (sample) { GLES20.glFinish(); SystemClock.elapsedRealtimeNanos() } else 0L
        try {
            plan.nodes.forEachIndexed { index, node ->
                val slot = plan.nodeSlots[index]
                GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, if (slot < 0) outputFbo else targets[slot].fbo)
                GLES20.glViewport(0, 0, node.size.width, node.size.height)
                val textures = node.inputs.mapValues { (_, source) ->
                    if (source < 0) Texture(inputTexId, input)
                    else Texture(targets[plan.nodeSlots[source]].texture, plan.nodes[source].size)
                }
                programs[index].draw(textures)
            }
            checkGl("render")
            if (sample) {
                GLES20.glFinish()
                val elapsed = (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0
                val interval = ((presentationTimeUs - lastTimeUs) / 1000.0).takeIf { it in 8.0..50.0 } ?: 41.7
                if (speed.sample(elapsed, interval)) { failed = true; report(EnhancementStatus.TooSlow) }
            }
            if (!failed) report(EnhancementStatus.Active)
            frame++
            lastTimeUs = presentationTimeUs
        } catch (error: Exception) {
            Log.w(TAG, "Enhancement rendering failed for $mode", error)
            failed = true
            report(EnhancementStatus.Failed)
        } finally {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, outputFbo)
            GLES20.glViewport(viewport[0], viewport[1], viewport[2], viewport[3])
        }
        if (failed) {
            // Show this frame unchanged as well; the controller removes the effect on the main thread.
            copy.draw(mapOf("INPUT" to Texture(inputTexId, input)))
        }
    }

    private fun clearPipeline() {
        graph = null
        programs.forEach { it.release() }; programs.clear()
        targets.forEach { target ->
            GLES20.glDeleteFramebuffers(1, intArrayOf(target.fbo), 0)
            GLES20.glDeleteTextures(1, intArrayOf(target.texture), 0)
        }
        targets.clear()
    }

    override fun release() {
        try { clearPipeline(); copy.release() } finally { super.release() }
    }

    private fun createTarget(size: ShaderSize): Target {
        val texture = IntArray(1).also { GLES20.glGenTextures(1, it, 0) }[0]
        val fbo = IntArray(1).also { GLES20.glGenFramebuffers(1, it, 0) }[0]
        try {
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            GLES30.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES30.GL_RGBA16F, size.width, size.height, 0, GLES20.GL_RGBA, GLES30.GL_HALF_FLOAT, null)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo)
            GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, texture, 0)
            check(GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) == GLES20.GL_FRAMEBUFFER_COMPLETE) { "Incomplete float framebuffer" }
            checkGl("allocate")
            return Target(texture, fbo)
        } catch (error: Exception) {
            GLES20.glDeleteFramebuffers(1, intArrayOf(fbo), 0)
            GLES20.glDeleteTextures(1, intArrayOf(texture), 0)
            throw error
        }
    }

    companion object {
        private const val TAG = "AnivioEnhancement"
        private const val MAX_BYTES = 96L * 1024 * 1024
        internal fun fragment(node: ShaderNode): String = buildString {
            appendLine("#version 300 es\nprecision highp float;\nprecision highp int;\nin vec2 v_uv;\nout vec4 outColor;")
            node.inputs.keys.forEach { name ->
                appendLine("uniform sampler2D u_$name;\nuniform vec2 u_${name}_size;")
                appendLine("#define ${name}_pos v_uv\n#define ${name}_size u_${name}_size\n#define ${name}_pt (vec2(1.0) / u_${name}_size)")
                appendLine("#define ${name}_tex(p) texture(u_$name, vec2(p))\n#define ${name}_texOff(p) texture(u_$name, v_uv + vec2(p) / u_${name}_size)")
            }
            appendLine(node.body)
            appendLine("void main() { outColor = hook(); }")
        }
        private const val COPY_FRAGMENT = """
            precision highp float;
            varying vec2 v_uv;
            uniform sampler2D u_INPUT;
            void main() { gl_FragColor = texture2D(u_INPUT, v_uv); }
        """
        private fun checkGl(operation: String) {
            val error = GLES20.glGetError()
            check(error == GLES20.GL_NO_ERROR) { "GL $operation error $error" }
        }
    }
}

private data class Texture(val id: Int, val size: ShaderSize)

/** Uniforms optimized out by a GPU driver are allowed; never assume a location exists. */
private class Program(fragment: String, modern: Boolean) {
    private val id: Int
    private val locations = mutableMapOf<String, Int>()
    private val vertexData = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
        put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0)
    }
    init {
        val vertex = if (modern) """
            #version 300 es
            in vec2 a_position;
            out vec2 v_uv;
            void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_uv = a_position * 0.5 + 0.5; }
        """.trimIndent() else """
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_uv = a_position * 0.5 + 0.5; }
        """.trimIndent()
        var vs = 0; var fs = 0; var program = 0
        try {
            vs = compile(GLES20.GL_VERTEX_SHADER, vertex)
            fs = compile(GLES20.GL_FRAGMENT_SHADER, fragment)
            program = GLES20.glCreateProgram()
            GLES20.glAttachShader(program, vs); GLES20.glAttachShader(program, fs)
            GLES20.glBindAttribLocation(program, 0, "a_position")
            GLES20.glLinkProgram(program)
            val status = IntArray(1); GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
            check(status[0] != 0) { GLES20.glGetProgramInfoLog(program).take(500) }
            id = program
        } catch (error: Exception) {
            if (program != 0) GLES20.glDeleteProgram(program)
            throw error
        } finally {
            if (vs != 0) GLES20.glDeleteShader(vs)
            if (fs != 0) GLES20.glDeleteShader(fs)
        }
    }
    fun draw(textures: Map<String, Texture>) {
        GLES20.glUseProgram(id)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        GLES20.glEnableVertexAttribArray(0)
        GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, vertexData)
        textures.entries.forEachIndexed { unit, (name, texture) ->
            val sampler = locations.getOrPut("u_$name") { GLES20.glGetUniformLocation(id, "u_$name") }
            if (sampler >= 0) {
                GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
                GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture.id)
                GLES20.glUniform1i(sampler, unit)
            }
            val size = locations.getOrPut("u_${name}_size") { GLES20.glGetUniformLocation(id, "u_${name}_size") }
            if (size >= 0) GLES20.glUniform2f(size, texture.size.width.toFloat(), texture.size.height.toFloat())
        }
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(0)
    }
    fun release() = GLES20.glDeleteProgram(id)
    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        try {
            GLES20.glShaderSource(shader, source); GLES20.glCompileShader(shader)
            val status = IntArray(1); GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
            check(status[0] != 0) { GLES20.glGetShaderInfoLog(shader).take(500) }
            return shader
        } catch (error: Exception) { GLES20.glDeleteShader(shader); throw error }
    }
}
