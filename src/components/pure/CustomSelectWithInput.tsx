import { Form, Select, Divider, Input } from "antd";
import React, { useState } from "react";

const CustomSelectWithInput = ({
  value,
  onChange,
  selectProps,
  inputProps,
}: any) => { //TODO: quitar ese any
  const { status } = Form.Item.useStatus();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const handleConfirm = () => {
    setIsDropdownOpen(false);
  };
  const options = selectProps.options as Array<string>;
  const inputValue = options.includes(value) ? value : undefined;
  return (
    <Select
      value={value}
      onChange={onChange}
      className={`custom-input-${status}`}
      open={isDropdownOpen}
      onDropdownVisibleChange={setIsDropdownOpen}
      popupMatchSelectWidth={false}
      dropdownRender={(menu) => {
        return (
          <>
            {menu}
            <Divider style={{ margin: "8px 0" }} />
            <Input
              value={inputValue}
              onChange={onChange}
              className={`custom-input-${status}`}
              onKeyDown={(e) => e.stopPropagation()}
              onPressEnter={handleConfirm}
              {...inputProps}
            />
          </>
        );
      }}
      {...selectProps}
    />
  );
};

export default CustomSelectWithInput;
