import { MenuProps, Menu } from "antd";
import { useRouter } from "next/router";

export const AutoMenu = (props: MenuProps) => {
  const router = useRouter();
  return (
    <Menu
      mode="inline"
      selectedKeys={[router.pathname.split("/").slice(0, 3).join("/")]}
      {...props}
    />
  );
};