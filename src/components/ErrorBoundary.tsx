import { Component, type ReactNode } from 'react';

/**
 * 通用错误兜底 —— 把"白屏"变成"友好提示 + 重试"
 *
 * 用法:
 *   <ErrorBoundary><SomePage /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<
  { fallback?: ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('Trip OS 渲染异常:', error, info);
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="mx-auto max-w-md px-4 py-16">
          <p className="text-[44px]">😵</p>
          <p className="h2 mt-3">页面加载出错了</p>
          <p className="muted mt-2">
            这个城市可能数据有点特殊。请回首页换个试试，或者刷新一次。
          </p>
          <details className="mt-3 rounded-xl border-[1.5px] border-ink/12 bg-paperDeep p-3 text-[12px]">
            <summary className="cursor-pointer font-semibold text-inkSoft">展开错误</summary>
            <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap text-[11px] text-inkFaint">
              {this.state.error.message}
            </pre>
          </details>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => location.reload()}
              className="focus-ring rounded-lg border-[1.5px] border-ink bg-ink px-4 py-2 text-[13px] font-bold text-white"
            >
              刷新
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="focus-ring rounded-lg border-[1.5px] border-ink/15 px-4 py-2 text-[13px] font-bold hover:border-ink"
            >
              回首页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
