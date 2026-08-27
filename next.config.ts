import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    /**
     * Next 16 changed the default from "any quality" to exactly `[75]`, and silently
     * coerces any other `quality` prop to the nearest allowed value. The hero is the
     * first thing anyone sees and is the one place worth spending bytes on, so 85 has
     * to be declared here or the `quality={85}` on it would quietly become 75.
     */
    qualities: [75, 85],
  },
};

export default nextConfig;
