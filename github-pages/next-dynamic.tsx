import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
} from 'react';

type DynamicOptions = {
  loading?: ComponentType;
  ssr?: boolean;
};

export default function dynamic<Props extends object>(
  loader: () => Promise<{ default: ComponentType<Props> }>,
  options: DynamicOptions = {},
) {
  const LazyComponent = lazy(loader);

  return function ClientOnlyDynamic(props: Props) {
    const [mounted, setMounted] = useState(options.ssr !== false);

    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      const Loading = options.loading;
      return Loading ? <Loading /> : null;
    }

    const Loading = options.loading;
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
