import { BreadcrumbProps, Breadcrumb } from "antd";
import Link from "next/link";
import { useRouter } from "next/router";

export interface TreeStruct {
  key: string;
  value: any;
  children?: TreeStruct[];
}
export interface AutoBreadcrumbProps {
  breadcrumItemTree: TreeStruct[];
}
export const AutoBreadcrumb = ({ breadcrumItemTree }: AutoBreadcrumbProps) => {
  const router = useRouter();
  const getBreadcrumItems = (): BreadcrumbProps["items"] => {
    const pathSegments = router.pathname.split("/").slice(1);
    const items = pathSegments.map((segment, index, segments) => {
      if (index === 0) return null;
      let currentBreadcrumbBranch = breadcrumItemTree;
      for (let count = 0; count < index; count++) {
        const newBreadcrumbBranch = currentBreadcrumbBranch.find(
          (item) => item.key === segments[count]
        );
        currentBreadcrumbBranch = newBreadcrumbBranch?.children || [];
      }
      const isDynamicSegment = segment.startsWith("[") && segment.endsWith("]");
      const dynamicSegmentKey = isDynamicSegment ? segment.slice(1, -1) : null;
      const dynamicSegmentValue = dynamicSegmentKey
        ? router.query[dynamicSegmentKey]
        : null;
      const path = `${router.pathname
        .split("/")
        .slice(0, index + 2)
        .map((value) =>
          value.startsWith("[") && value.endsWith("]")
            ? router.query[value.slice(1, -1)]
            : value
        )
        .join("/")}`;

      const label =
        currentBreadcrumbBranch.find((item) => item.key === segment)?.value ||
        segment ||
        null;
      if (!label) return null;
      return {
        key: path,
        title: (
          <Link href={path}> {/* //TODO: Tener en cuenta no eliminar url params en el link */}
            {isDynamicSegment ? dynamicSegmentValue : label}
          </Link>
        ),
      };
    });
    return items.filter((item) => !!item) as BreadcrumbProps["items"];
  };
  return (
    <>
      <Breadcrumb
        style={{ margin: "16px 0" }}
        items={getBreadcrumItems()}
      ></Breadcrumb>
    </>
  );
};
