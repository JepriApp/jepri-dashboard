import { Typography } from "antd";
import { useRouter } from "next/router";

export interface AutoTitleProps {
  titles: Record<string, string>;
  subtitles: Record<string, string>;
}
export const AutoTitle = ({ titles, subtitles }: AutoTitleProps) => {
  const router = useRouter();

  const replacePlaceholders = (text: string): string => {
    return text.replace(/\${(\w+)}/g, (_, key) =>
      String(router.query[key] || `\${${key}}`)
    );
  };
  // Remove the first segment of the pathname (role)
  const trimmedPathname = router.pathname.split("/").slice(2).join("/");
  const title = titles[trimmedPathname] || "";
  const subtitle = subtitles[trimmedPathname] || "";

  return (
    <>
      <Typography.Title level={2} style={{ paddingLeft: 12 }}>
        {replacePlaceholders(title)}
      </Typography.Title>
      <Typography.Text type="secondary" style={{ paddingLeft: 12 }}>
        {replacePlaceholders(subtitle)}
      </Typography.Text>
    </>
  );
};
