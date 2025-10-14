import { Image, message } from "antd";
import { useState } from "react";
import CardFlower from "./CardFlower";

export const ImagePreviewCardFlower = ({ src }: { src: string[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => {
        if (!src || src.length === 0 || src[0] === "") {
          message.error("No hay imagen para mostrar");
          return;
        }
        setOpen(true);
      }}
    >
      <CardFlower openAmount={10} src={src[0] || ""} />
      <Image.PreviewGroup
        items={src}
        preview={{
          visible: open,
          onVisibleChange: setOpen,
        }}
      />
    </div>
  );
};
