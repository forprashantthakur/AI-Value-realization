import * as React from "react";
import { navigate } from "../router";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; prefetch?: boolean };
const Link = React.forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, scroll: _s, prefetch: _p, ...rest }, ref) {
  void _s;
  void _p;
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
});
export default Link;
