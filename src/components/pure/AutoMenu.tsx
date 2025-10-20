import { MenuProps, Menu } from "antd";
import { useRouter } from "next/router";

export const AutoMenu = (props: MenuProps) => {
  const router = useRouter();
  return (
    <Menu
      mode="inline"
      selectedKeys={[router.asPath.split("?")[0].split("#")[0]]}
      style={{border: "1px solid transparent"}}
      {...props}
    />
  );
};