package com.nuvio.app.features.player.enhancement

import kotlin.math.min
import kotlin.math.roundToInt

/** Deliberately limited to the bundled fragment shaders, never executes downloaded shader code. */
internal data class MpvPass(
    val hook: String, val binds: List<String>, val save: String, val width: String?, val height: String?,
    val condition: String?, val body: String,
)

internal fun parseMpvShader(source: String): List<MpvPass> {
    val result = mutableListOf<MpvPass>()
    val header = mutableListOf<Pair<String, String>>()
    val code = StringBuilder()
    fun flush() {
        if (header.isEmpty()) return
        fun field(name: String) = header.lastOrNull { it.first == name }?.second
        val hook = requireNotNull(field("HOOK"))
        require(hook == "MAIN" || hook == "LUMA")
        require(code.contains("vec4 hook()"))
        val binds = header.filter { it.first == "BIND" }.map { it.second }
        require(binds.isNotEmpty() && binds.all { it.matches(Regex("[A-Za-z_][A-Za-z0-9_]*")) })
        result += MpvPass(hook, binds, field("SAVE") ?: hook, field("WIDTH"), field("HEIGHT"), field("WHEN"), code.toString())
        header.clear(); code.clear()
    }
    source.lineSequence().forEach { line ->
        if (line.startsWith("//!")) {
            if (code.isNotBlank()) flush()
            val directive = line.removePrefix("//!").trim().split(' ', limit = 2)
            require(directive[0] in setOf("DESC", "HOOK", "BIND", "SAVE", "WIDTH", "HEIGHT", "WHEN", "COMPONENTS"))
            header += directive[0] to directive.getOrElse(1) { "" }
        } else if (header.isNotEmpty()) code.appendLine(line)
    }
    flush()
    require(result.isNotEmpty())
    return result
}

internal data class ShaderSize(val width: Int, val height: Int)
internal data class ShaderNode(val size: ShaderSize, val inputs: Map<String, Int>, val body: String)
internal data class ShaderGraph(val nodes: List<ShaderNode>, val output: ShaderSize, val slots: List<ShaderSize>, val nodeSlots: List<Int>) {
    // Reserve decoder/input and Media3 output surfaces too, not just our intermediate textures.
    fun estimatedBytes(input: ShaderSize): Long = slots.sumOf { it.width.toLong() * it.height * 8L } +
        input.width.toLong() * input.height * 8L + output.width.toLong() * output.height * 8L
}

internal fun enhancementOutputSize(input: ShaderSize, display: ShaderSize, upscale: Boolean): ShaderSize {
    require(input.width > 0 && input.height > 0 && display.width > 0 && display.height > 0)
    if (!upscale) return input
    val longSide = maxOf(input.width, input.height)
    val shortSide = minOf(input.width, input.height)
    val ratio = minOf(2.0, maxOf(display.width, display.height).toDouble() / longSide,
        minOf(display.width, display.height).toDouble() / shortSide, 1920.0 / longSide, 1080.0 / shortSide).coerceAtLeast(1.0)
    return ShaderSize((input.width * ratio).roundToInt(), (input.height * ratio).roundToInt())
}

/** Small RPN evaluator for mpv's dimension/condition directives. No scripting or substitutions. */
internal fun evaluateShaderExpression(expression: String, sizes: Map<String, ShaderSize>): Double {
    val stack = mutableListOf<Double>()
    expression.trim().split(Regex("\\s+")).forEach { token ->
        val number = token.toDoubleOrNull()
        if (number != null) stack += number else if (token.endsWith(".w") || token.endsWith(".h")) {
            val size = requireNotNull(sizes[token.dropLast(2)]) { "Missing shader texture $token" }
            stack += (if (token.endsWith(".w")) size.width else size.height).toDouble()
        } else {
            require(stack.size >= 2)
            val b = stack.removeAt(stack.lastIndex); val a = stack.removeAt(stack.lastIndex)
            stack += when (token) {
                "+" -> a + b; "-" -> a - b; "*" -> a * b; "/" -> a / b
                ">" -> if (a > b) 1.0 else 0.0; "<" -> if (a < b) 1.0 else 0.0
                else -> error("Unsupported shader expression token $token")
            }
        }
    }
    require(stack.size == 1 && stack.single().isFinite())
    return stack.single()
}

// Media3 supplies linear BT.709 RGB; mpv MAIN/LUMA models expect transfer-encoded pixels.
private const val ENCODE = """
vec4 hook() {
    vec3 c = max(INPUT_tex(INPUT_pos).rgb, vec3(0.0));
    vec3 encoded = mix(4.5 * c, 1.099 * pow(c, vec3(0.45)) - 0.099, step(vec3(0.018), c));
    return vec4(encoded, 1.0);
}
"""
private const val LUMA = "vec4 hook() { return vec4(dot(MAIN_tex(MAIN_pos).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 0.0, 1.0); }"
private const val DECODE = """
vec4 hook() {
    vec3 c = clamp(MAIN_tex(MAIN_pos).rgb, 0.0, 1.0);
    return vec4(mix(c / 4.5, pow((c + 0.099) / 1.099, vec3(1.0 / 0.45)), step(vec3(0.081), c)), 1.0);
}
"""

internal fun buildShaderGraph(sources: List<String>, input: ShaderSize, output: ShaderSize): ShaderGraph? {
    val nodes = mutableListOf(ShaderNode(input, mapOf("INPUT" to -1), ENCODE))
    var main = 0
    var applied = false
    sources.forEach { source ->
        val passes = parseMpvShader(source)
        val hook = passes.first().hook
        require(passes.all { it.hook == hook })
        val original = main
        val names = mutableMapOf(hook to main)
        if (hook == "LUMA") {
            nodes += ShaderNode(nodes[main].size, mapOf("MAIN" to main), LUMA)
            names[hook] = nodes.lastIndex
        }
        passes.forEach passLoop@ { pass ->
            val sizes = names.mapValues { nodes[it.value].size } + ("OUTPUT" to output)
            if (pass.condition != null && evaluateShaderExpression(pass.condition, sizes) == 0.0) return@passLoop
            val base = sizes.getValue(hook)
            val width = pass.width?.let { evaluateShaderExpression(it, sizes).roundToInt() } ?: base.width
            val height = pass.height?.let { evaluateShaderExpression(it, sizes).roundToInt() } ?: base.height
            require(width in 1..4096 && height in 1..4096)
            nodes += ShaderNode(ShaderSize(width, height), pass.binds.associateWith { names.getValue(it) }, pass.body)
            names[pass.save] = nodes.lastIndex
            applied = true
        }
        main = names.getValue(hook)
        if (hook == "LUMA") {
            // Preserve the source chroma while replacing only its learned, upscaled luma.
            nodes += ShaderNode(nodes[main].size, mapOf("MAIN" to original, "LUMA" to main), """
                vec4 hook() {
                    vec3 rgb = MAIN_tex(MAIN_pos).rgb;
                    float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
                    return vec4(rgb + vec3(LUMA_tex(LUMA_pos).r - y), 1.0);
                }
            """.trimIndent())
            main = nodes.lastIndex
        }
    }
    if (!applied) return null
    nodes += ShaderNode(output, mapOf("MAIN" to main), DECODE)
    val lastReads = IntArray(nodes.size) { it }
    nodes.forEachIndexed { index, node -> node.inputs.values.filter { it >= 0 }.forEach { lastReads[it] = maxOf(lastReads[it], index) } }
    val slots = mutableListOf<ShaderSize>()
    val availableAfter = mutableListOf<Int>()
    val assignments = nodes.mapIndexed { index, node ->
        if (index == nodes.lastIndex) -1 else {
            val reusable = slots.indices.firstOrNull { slots[it] == node.size && availableAfter[it] < index }
            val slot = reusable ?: slots.size.also { slots += node.size; availableAfter += -1 }
            availableAfter[slot] = lastReads[index]
            slot
        }
    }
    return ShaderGraph(nodes, output, slots, assignments)
}

/** Only declare failure after sustained slow samples; ignore a single driver scheduling spike. */
internal class EnhancementPerformanceGuard {
    private var slow = 0
    fun sample(elapsedMs: Double, frameIntervalMs: Double): Boolean {
        val budget = min(42.0, frameIntervalMs.coerceIn(16.0, 42.0))
        slow = if (elapsedMs > budget) slow + 1 else (slow - 1).coerceAtLeast(0)
        return slow >= 3
    }
}
