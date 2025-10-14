import {
  Button,
  ButtonProps,
  Popconfirm,
  PopconfirmProps,
} from "antd";
import { useState } from "react";

const AsyncButton = (
  props: ButtonProps & {
    onClick?:
      | ButtonProps["onClick"]
      | (() => Promise<void>);
    popConfirm?: boolean | PopconfirmProps;
  },
) => {
  const { onClick, popConfirm, ...rest } = props;
  const [loading, setLoading] = useState(false);
  const handleClick = async (e: any) => {
    if (onClick === undefined) return;

    setLoading(true);
    try {
      await onClick(e);
    } finally {
      setLoading(false);
    }
  };
  if (popConfirm) {
    const popConfirmProps =
      typeof popConfirm === "boolean" ? {} : popConfirm;
    return (
      <Popconfirm
        title="Are you sure?"
        okText="Yes"
        cancelText="No"
        {...popConfirmProps}
        onConfirm={handleClick}
      >
          <Button
            {...rest}
            loading={loading}
            disabled={loading || rest.disabled}
          >
            {rest.children}
          </Button>
      </Popconfirm>
    );
  }

  return (
      <Button
        {...rest}
        loading={loading}
        disabled={loading || rest.disabled}
        onClick={handleClick}
      >
        {rest.children}
      </Button>
  );
};
export default AsyncButton;
