import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
// GL backend. Unset = Chrome's default. Use `angle` on a laptop with a GPU,
// `swangle` (software) on a server without one.
if (process.env.REMOTION_GL) {
  Config.setChromiumOpenGlRenderer(process.env.REMOTION_GL as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl');
}

// Use a locally installed Chromium when one is provided, instead of letting
// Remotion download its own headless shell.
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
