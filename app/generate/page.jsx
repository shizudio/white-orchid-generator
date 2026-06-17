'use client';
import dynamic from 'next/dynamic';

const Generator = dynamic(() => import('@/components/Generator'), { ssr: false });

export default function GeneratePage() {
  return <Generator />;
}
