declare module 'react-scroll-to-bottom' {
  import * as React from 'react';

  export interface ScrollToBottomProps {
    className?: string;
    followButtonClassName?: string;
    mode?: 'auto' | 'top' | 'bottom';
    initialScrollBehavior?: 'auto' | 'smooth';
    children?: React.ReactNode;
  }

  export default function ScrollToBottom(props: ScrollToBottomProps): JSX.Element;
}

