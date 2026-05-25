import React, { useEffect, useState } from "react";

export function BrandImage({ src, fallbackSrc = "", alt = "", className = "", ...props }) {
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc);

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc);
  }, [src, fallbackSrc]);

  return React.createElement("img", {
    ...props,
    className,
    src: currentSrc || fallbackSrc,
    alt,
    onError: () => {
      if (fallbackSrc && currentSrc !== fallbackSrc) {
        setCurrentSrc(fallbackSrc);
      }
    }
  });
}
