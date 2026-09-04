import { Config } from "@remotion/cli/config";

// Alpha-capable output for overlay clips dropped on the Resolve timeline.
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuva444p10le");
Config.setCodec("prores");
Config.setProResProfile("4444");
