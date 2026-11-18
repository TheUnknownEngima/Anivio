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
        assertEquals(ShaderSize(1920, 1080), enhancementOutputSize(input, ShaderSize(2560, 1440), true, EnhancementResolution.FullHd))
        assertEquals(ShaderSize(1080, 1920), enhancementOutputSize(ShaderSize(720, 1280), ShaderSize(1440, 2560), true, EnhancementResolution.FullHd))
        assertEquals(ShaderSize(3840, 2160), enhancementOutputSize(ShaderSize(3840, 2160), ShaderSize(1920, 1080), true))
    }

    @Test fun native2kFitsThePocoDisplayAndNeverExceedsTwoTimesOrTheOutputCap() {
        assertEquals(EnhancementResolution.Native2k, EnhancementResolution.fromStorage(null))
        assertEquals(EnhancementResolution.Native2k, EnhancementResolution.fromStorage("invalid"))
        assertEquals(ShaderSize(2276, 1280), enhancementOutputSize(ShaderSize(1920, 1080), ShaderSize(2772, 1280), true))
        assertEquals(ShaderSize(1280, 2276), enhancementOutputSize(ShaderSize(1080, 1920), ShaderSize(1280, 2772), true))
        assertEquals(ShaderSize(2560, 1440), enhancementOutputSize(ShaderSize(1920, 1080), ShaderSize(3840, 2160), true))
        assertEquals(ShaderSize(1280, 720), enhancementOutputSize(ShaderSize(640, 360), ShaderSize(3840, 2160), true))
        assertEquals(ShaderSize(1920, 1080), enhancementOutputSize(ShaderSize(1920, 1080), ShaderSize(1920, 1080), true))
    }

    @Test fun everyUpscalerRunsFor1080pTo1280pWithoutAllocatingA4kIntermediate() {
        val input = ShaderSize(1920, 1080)
        val output = enhancementOutputSize(input, ShaderSize(2772, 1280), true)
        VideoEnhancement.entries.filter { it != VideoEnhancement.Off && it != VideoEnhancement.Light }.forEach { mode ->
            val graph = assertNotNull(buildShaderGraph(mode.shaders.map(::source), input, output), mode.name)
            assertEquals(output, graph.output)
            assertTrue(graph.nodes.last().body.contains("upscaleAt"), mode.name)
            assertTrue(graph.slots.all { it.width <= input.width && it.height <= input.height }, mode.name)
            val budget = enhancementMemoryBudget(EnhancementResolution.Native2k, false, 12_000_000_000L)
            assertTrue(graph.estimatedBytes(input) <= budget,
                "${mode.name}: ${graph.estimatedBytes(input) / (1024 * 1024)} MiB exceeds budget")
        }
    }

    @Test fun memoryHeadroomDependsOnTheDeviceAndTheSelectedOutputLimit() {
        fun budget(output: EnhancementResolution, lowRam: Boolean, ram: Long) = enhancementMemoryBudget(output, lowRam, ram) / (1024 * 1024)
        assertEquals(224L, budget(EnhancementResolution.Native2k, false, 12_000_000_000L))
        assertEquals(160L, budget(EnhancementResolution.Native2k, false, 5_500_000_000L))
        assertEquals(96L, budget(EnhancementResolution.Native2k, false, 0L))
        assertEquals(96L, budget(EnhancementResolution.FullHd, false, 12_000_000_000L))
        assertEquals(32L, budget(EnhancementResolution.Native2k, true, 12_000_000_000L))
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
        assertTrue(graph.nodes.last().inputs.containsKey("SOURCE_RGB"))
        assertTrue(graph.nodes.last().body.contains("oldLuma"))
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
              val sizes = if (mode == VideoEnhancement.Light) listOf(ShaderSize(64, 36)) else listOf(ShaderSize(128, 72), ShaderSize(76, 43))
              sizes.forEach { outputSize ->
               listOf(true, false).forEach { fused ->
                val graph = assertNotNull(buildShaderGraph(mode.shaders.map(::source), ShaderSize(64, 36), outputSize, fuseOutput = fused))
                add(buildJsonObject {
                    put("mode", "${mode.name}/${outputSize.width}x${outputSize.height}/${if (fused) "fused" else "reference"}")
                    put("pair", "${mode.name}/${outputSize.width}x${outputSize.height}")
                    put("reference", !fused)
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
            }
        }
        File("build/enhancement-gpu-fixtures.json").writeText(output.toString())
    }
}
