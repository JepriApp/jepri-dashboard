import { Customer } from "@/constants/models";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import React from "react";

const RenderCustomer = ({
  customer,
  href,
}: {
  customer: Customer;
  href?: string;
}) => {
  const { fullName, email, cellphone } = customer;
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
        <Typography.Text
          type="secondary"
          style={{ wordBreak: "break-all", color: "#999" }}
        >
          <MailOutlined style={{ marginRight: 4 }} />
          Sin email
        </Typography.Text>
      )}
      <br />
      {cellphone ? (
        <Typography.Link
          href={`tel:${cellphone}`}
          style={{
            wordBreak: "break-all",
          }}
        >
          <PhoneOutlined style={{ marginRight: 4 }} />
          {cellphone}
        </Typography.Link>
      ) : (
        <Typography.Text
          type="secondary"
          style={{ color: "#999", wordBreak: "break-all" }}
        >
          <PhoneOutlined style={{ marginRight: 4 }} />
          Sin teléfono
        </Typography.Text>
      )}
    </>
  );
};

export default RenderCustomer;
