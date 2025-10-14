import { User } from "@/store/auth.store";
import {
  UserOutlined,
} from "@ant-design/icons";
import {
  ButtonProps,
  theme,
  Dropdown,
  Space,
  Typography,
  Divider,
  Button,
  Avatar,
  DropdownProps,
} from "antd";
import React from "react";

interface ProfileButtonProps {
  width: number;
  user: User;
  dropdownProps?: DropdownProps;
  buttonProps?:ButtonProps
}
export const ProfileButton = ({
  width,
  user,
  dropdownProps,
  buttonProps
}: ProfileButtonProps) => {
  const {
    token: { borderRadiusLG, colorBgElevated, boxShadowSecondary },
  } = theme.useToken();
  const contentStyle = {
    backgroundColor: colorBgElevated,
    borderRadius: borderRadiusLG,
    boxShadow: boxShadowSecondary,
  };
  const isCollapsed = width < 90;
  return (
    <Dropdown
      trigger={["click"]}
      dropdownRender={(menu) => (
        <div style={contentStyle}>
          <Space
            style={{
              padding: 8,
              display: "flex",
              alignItems: "center",
              flexDirection: "column",
            }}
          >
            <Typography.Text type="secondary">
              {user.email || "Email desconocido"}
            </Typography.Text>
          </Space>
          <Divider style={{ margin: 0 }} />
          {React.cloneElement(menu as React.ReactElement)}
        </div>
      )}
      {...dropdownProps}
    >
      <Button
        size="large"
        type="text"
        icon={<Avatar icon={<UserOutlined />} />}
        style={{
          width: width,
          position: "fixed",
          bottom: 48,
          overflow: "hidden",
          height: 64,
        }}
        {...buttonProps}
      >
        {buttonProps?.children || (
          <Typography.Text
            type="secondary"
            style={{
              overflow: "hidden",
              display: isCollapsed ? "none" : "inherit",
            }}
          >
            {user.name || "Usuario desconocido"}
          </Typography.Text>
        )}
      </Button>
    </Dropdown>
  );
};