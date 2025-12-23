import { Typography } from "antd";

interface PageTitleProps {
  title: string;
  subtitle?: string;
}

export const PageTitle = ({ title, subtitle }: PageTitleProps) => {
  return (
    <>
      <Typography.Title level={2} style={{ marginBottom: 0 }}>
        {title}
      </Typography.Title>
      {subtitle && (
        <Typography.Text type="secondary">{subtitle}</Typography.Text>
      )}
    </>
  );
};
