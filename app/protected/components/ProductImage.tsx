import Image from "next/image";

const SIZE_MAP = {
  small: {
    width: 50,
    height: 50,
  },
  medium: {
    width: 80,
    height: 80,
  },
  large: {
    width: 110,
    height: 110,
  },
};

const ProductImage = ({
  source,
  name,
  size = "medium",
}: {
  source: string | null;
  name?: string;
  size?: "small" | "medium" | "large";
}) => {
  return (
    <Image
      src={source || "/images/foto-no-disponible.png"}
      alt={name || "imagen-producto-" + source}
      width={1408}
      height={768}
      sizes="(max-width: 768px) 100vw, 200px"
      className="shadow-md"
      style={{
        objectFit: "cover",
        objectPosition: "center",
        display: "block",
        minWidth: SIZE_MAP['small'].width,
        ...SIZE_MAP[size],
      }}
    />
  );
};

export default ProductImage;