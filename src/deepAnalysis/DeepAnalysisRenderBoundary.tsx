import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; onReset: () => void; resetKey: string; title: string; body: string; action: string };
type State = { hasError: boolean };

/** Keeps a malformed provider result from taking down the whole decision workspace. */
export class DeepAnalysisRenderBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: Props) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <section className="deep-error product-panel" role="alert"><strong>{this.props.title}</strong><span>{this.props.body}</span><button onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}>{this.props.action}</button></section>;
  }
}
