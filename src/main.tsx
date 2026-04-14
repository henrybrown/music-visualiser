import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MusicVisualizerDemo } from "./music-visualiser/music-visualiser-demo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MusicVisualizerDemo />
  </StrictMode>
);
