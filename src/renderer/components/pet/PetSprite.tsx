import { useEffect, useRef, useState } from "react";

interface PetSpriteProps {
  src: string;
  name: string;
}

/** GIF 独立循环播放；仅在系统要求减少动态效果时显示静态帧。 */
export function PetSprite({ src, name }: PetSpriteProps) {
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frozenSource, setFrozenSource] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const moving = !reducedMotion;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function freezeFrame() {
    if (moving || !image.current?.naturalWidth || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    canvas.current.width = image.current.naturalWidth;
    canvas.current.height = image.current.naturalHeight;
    context.drawImage(image.current, 0, 0);
    setFrozenSource(src);
  }

  useEffect(() => {
    freezeFrame();
  }, [src, moving]);

  const frozen = !moving && frozenSource === src;
  return <>
    <img ref={image} className="pet-sprite" src={src} alt={name} draggable={false}
      onLoad={freezeFrame} style={{ visibility: frozen ? "hidden" : "visible" }} aria-hidden={frozen} />
    <canvas ref={canvas} className="pet-sprite" role="img" aria-label={name}
      aria-hidden={!frozen} style={{ visibility: frozen ? "visible" : "hidden" }} />
  </>;
}
