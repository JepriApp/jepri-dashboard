import { Vendor } from "@/constants/models";
import { MailOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import React from "react";

const RenderVendor = ({ vendor, href }: { vendor: Vendor; href?: string }) => {
  const { fullName, email } = vendor;
  return (
    <>
      <Typography.Link style={{ width: "100px" }} ellipsis href={href}>
        {fullName}
      </Typography.Link>
      <br />
      {email ? (
        <Typography.Link
          href={`mailto:${email}`}
          style={{
            wordBreak: "break-all",
          }}
        >
          <MailOutlined style={{ marginRight: 4 }} />
          {email}
        </Typography.Link>
      ) : (
        <Typography.Text type="secondary" style={{ color: "#999" }}>
          <MailOutlined style={{ marginRight: 4 }} />
          Sin email
        </Typography.Text>
      )}
    </>
  );
};

export default RenderVendor;
