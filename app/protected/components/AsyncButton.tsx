import { Button, ButtonProps, Popconfirm, PopconfirmProps } from "antd";
import { useState } from "react";

const AsyncButton = (
  props: ButtonProps & {
    onClick?: ButtonProps["onClick"] | (() => Promise<void>);
    popConfirm?: boolean | PopconfirmProps;
  }
) => {
  const { onClick, popConfirm, ...rest } = props;
  const [loading, setLoading] = useState(false);

  if (popConfirm) {
    const popConfirmProps = typeof popConfirm === "boolean" ? {} : popConfirm;
    return (
      <Popconfirm
        title="Are you sure?"
        okText="Yes"
        cancelText="No"
        {...popConfirmProps}
        onConfirm={async (e) => {
          if (onClick === undefined) return;

          setLoading(true);
          try {
            if (e!) {
              onClick(e);
            }
          } finally {
            setLoading(false);
          }
        }}
      >
        <Button {...rest} loading={loading} disabled={loading || rest.disabled}>
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
      onClick={(e) => {
        if (onClick === undefined) return;

        setLoading(true);
        try {
          onClick(e);
        } finally {
          setLoading(false);
        }
      }}
    >
      {rest.children}
    </Button>
  );
};
export default AsyncButton;
