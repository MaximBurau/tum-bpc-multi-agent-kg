/**
 * Navigation component
 * 
 * Top navigation bar providing access to all main sections of the dashboard.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Pipeline Runner', href: '/' },
  { name: 'Flows', href: '/flows' },
  { name: 'Agents', href: '/agents' },
  { name: 'Run History', href: '/runs' },
  { name: 'Playground', href: '/playground' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900/70 backdrop-blur-sm border-b border-gray-800/50 sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-6">
        <div className="flex justify-between h-12">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center">
                <span className="text-white font-semibold text-xs">KG</span>
              </div>
              <span className="text-sm font-medium text-gray-300">
                Multi-Agent KG
              </span>
            </div>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/50 rounded border border-gray-700/50">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <span className="text-xs text-gray-400">Online</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
