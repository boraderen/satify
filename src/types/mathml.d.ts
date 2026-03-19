import type * as React from "react";

type MathElementProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathElementProps;
      mi: MathElementProps;
      mn: MathElementProps;
      mo: MathElementProps;
      mrow: MathElementProps;
      msub: MathElementProps;
      mtext: MathElementProps;
      munder: MathElementProps;
      munderover: MathElementProps;
    }
  }
}

export {};
