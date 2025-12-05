import * as React from "react";

declare module "react" {
  interface HTMLAttributes<T> extends React.AriaAttributes, React.DOMAttributes<T> {
    style?: React.CSSProperties | string;
  }

  interface SVGAttributes<T> extends React.AriaAttributes, React.DOMAttributes<T> {
    style?: React.CSSProperties | string;
  }
}

