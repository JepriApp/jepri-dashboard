import { Space, Select, Input } from "antd";
import React, { useState } from "react";

export interface SearchFieldProps {
  value?: string;
  fieldName: string;
  label: string;
  type: "text" | "options";
  options?: { label: React.ReactNode; value: string }[];
}
export const SearchBar = ({
  searchFields,
}: {
  searchFields: SearchFieldProps[];
}) => {
  const [search, setSearch] = useState<SearchFieldProps>({ ...searchFields[0] });
  const SearchComponent = (
    <Space.Compact>
      <Select
        options={searchFields.map((field) => ({
          label: field.label,
          value: field.fieldName,
        }))}
        value={search.fieldName}
        onChange={(value) => {
          const newSearch = searchFields.find(
            (field) => field.fieldName === value
          );
          if (newSearch) {
            setSearch({ ...newSearch, value: "" });
          }
        }}
        popupMatchSelectWidth={false}
        style={{ minWidth: 150 }}
      />
      {search.type === "text" && (
        <Input
          placeholder="Buscar..."
          onChange={(e) => {
            setSearch({ ...search, value: e.target.value });
          }}
          value={search.value}
          style={{ minWidth: 150 }}
          allowClear
        />
      )}
      {search.type === "options" && (
        <Select
          options={search.options}
          placeholder="Buscar..."
          onChange={(value) => {
            setSearch({ ...search, value: value });
          }}
          value={search.value}
          showSearch={false}
          popupMatchSelectWidth={false}
          style={{ minWidth: 150 }}
          allowClear
        />
      )}
    </Space.Compact>
  );
  return { SearchComponent, search };
};

export default SearchBar;
