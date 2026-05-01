/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Docker multi-stage build
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/editor',
        permanent: false,
      },
      {
        source: '/graphs',
        destination: '/editor',
        permanent: false,
      },
      {
        source: '/introduction',
        destination: '/editor',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
