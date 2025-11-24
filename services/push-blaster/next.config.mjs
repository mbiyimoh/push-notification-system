/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
        // ... any existing webpack config
        return config;
    },
};

export default nextConfig;
