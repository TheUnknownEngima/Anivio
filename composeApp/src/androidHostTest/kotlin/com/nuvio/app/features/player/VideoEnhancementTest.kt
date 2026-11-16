package com.nuvio.app.features.player

import com.nuvio.app.features.player.enhancement.*
import java.io.File
import kotlinx.serialization.json.*
import kotlin.test.*

class VideoEnhancementTest {
    private val assets = File("src/androidMain/assets/video_enhancement")
    private fun source(name: String) = File(assets, name).readText()

    @Test fun unknownSettingsAreOffAndLightNeverUpscales() {
        assertEquals(VideoEnhancement.Off, VideoEnhancement.fromStorage("broken"))
        assertEquals(VideoEnhancement.Off, VideoEnhancement.fromStorage(null))
        val input = ShaderSize(1280, 720)
        assertEquals(input, enhancementOutputSize(input, ShaderSize(2560, 1440), false))
        assertEquals(ShaderSize(1920, 1080), enhancementOutputSize(input, ShaderSize(2560, 1440), true))
        assertEquals(ShaderSize(1080, 1920), enhancementOutputSize(ShaderSize(720, 1280), ShaderSize(1440, 2560), true))
        assertEquals(ShaderSize(3840, 2160), enhancementOutputSize(ShaderSize(3840, 2160), ShaderSize(1920, 1080), true))
    }

    @Test fun bundledShadersHaveValidBindingsAndNoReadWriteFeedback() {
        VideoEnhancement.entries.filter { it != VideoEnhancement.Off }.forEach { mode ->
            val graph = assertNotNull(buildShaderGraph(mode.shaders.map(::source), ShaderSize(640, 360),
                if (mode == VideoEnhancement.Light) ShaderSize(640, 360) else ShaderSize(1280, 720)), mode.name)
            graph.nodes.forEachIndexed { index, node ->
                node.inputs.values.filter { it >= 0 }.forEach { dependency ->
                    assertTrue(dependency < index, "${mode.name}: dependency must already exist")
                    assertNotEquals(graph.nodeSlots[dependency], graph.nodeSlots[index], "${mode.name}: cannot render into an input texture")
                    // A slot cannot be overwritten between producing a value and its last read.
                    (dependency + 1 until index).forEach { between ->
                        assertNotEquals(graph.nodeSlots[dependency], graph.nodeSlots[between], "${mode.name}: live texture overwritten")
                    }
                }
            }
            assertTrue(graph.estimatedBytes(ShaderSize(640, 360)) < 96L * 1024 * 1024)
        }
    }

    @Test fun upscaleOnlyModesSkipNativeResolutionAndRestorationStillRuns() {
        val size = ShaderSize(1920, 1080)
        for (mode in listOf(VideoEnhancement.Fsrcnnx, VideoEnhancement.Anime4kC, VideoEnhancement.Anime4kGan))
            assertNull(buildShaderGraph(mode.shaders.map(::source), size, size))
        val graph = assertNotNull(buildShaderGraph(VideoEnhancement.Anime4kA.shaders.map(::source), size, size))
        assertTrue(graph.nodes.all { it.size == size })
        assertTrue(graph.nodes.size > 2)
    }

    @Test fun fsrcnnxHasAnExplicitLumaAndChromaPath() {
        val graph = assertNotNull(buildShaderGraph(VideoEnhancement.Fsrcnnx.shaders.map(::source), ShaderSize(320, 180), ShaderSize(640, 360)))
        assertTrue(graph.nodes.any { it.inputs.keys == setOf("MAIN", "LUMA") && it.body.contains("rgb + vec3") })
        assertTrue(graph.nodes.first().body.contains("pow"))
        assertTrue(graph.nodes.last().body.contains("1.0 / 0.45"))
    }

    @Test fun invalidShaderDirectivesAndExpressionsAreRejected() {
        assertFails { parseMpvShader("//!HOOK MAIN\n//!COMPUTE 8 8\n//!BIND MAIN\nvec4 hook() { return vec4(1.0); }") }
        assertFails { evaluateShaderExpression("MISSING.w 2 *", emptyMap()) }
        assertFails { evaluateShaderExpression("1 0 /", emptyMap()) }
        assertEquals(1.0, evaluateShaderExpression("OUTPUT.w MAIN.w / 1.2 >", mapOf("OUTPUT" to ShaderSize(1280, 720), "MAIN" to ShaderSize(640, 360))))
    }

    @Test fun aSingleSlowFrameDoesNotDisableProcessingButSustainedSlownessDoes() {
        val guard = EnhancementPerformanceGuard()
        assertFalse(guard.sample(90.0, 41.7))
        repeat(5) { assertFalse(guard.sample(10.0, 41.7)) }
        assertFalse(guard.sample(60.0, 41.7))
        assertFalse(guard.sample(60.0, 41.7))
        assertTrue(guard.sample(60.0, 41.7))
    }

    /** Export the exact native-generated shader graphs for a separate GLES/WebGL compiler smoke test. */
    @Test fun exportGpuFixtures() {
        val output = buildJsonArray {
            VideoEnhancement.entries.filter { it != VideoEnhancement.Off }.forEach { mode ->
                val graph = assertNotNull(buildShaderGraph(mode.shaders.map(::source), ShaderSize(64, 36),
                    if (mode == VideoEnhancement.Light) ShaderSize(64, 36) else ShaderSize(128, 72)))
                add(buildJsonObject {
                    put("mode", mode.name)
                    put("width", graph.output.width); put("height", graph.output.height)
                    put("nodes", buildJsonArray {
                        graph.nodes.forEachIndexed { index, node -> add(buildJsonObject {
                            put("shader", AnimeShaderProgram.fragment(node))
                            put("width", node.size.width); put("height", node.size.height)
                            put("slot", graph.nodeSlots[index])
                            put("inputs", buildJsonObject { node.inputs.forEach { (name, id) -> put(name, id) } })
                        }) }
                    })
                })
            }
        }
        File("build/enhancement-gpu-fixtures.json").writeText(output.toString())
    }
}
