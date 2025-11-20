/**
 * Navigation component
 * 
 * Top navigation bar providing access to all main sections of the dashboard.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Agents', href: '/agents' },
  { name: 'Pipeline', href: '/pipeline' },
  { name: 'KG Visualization', href: '/kg-viz' },
  { name: 'LLM Playground', href: '/llm' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900/50 backdrop-blur-md border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">KG</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Multi-Agent
              </span>
            </div>
            <div className="hidden sm:ml-10 sm:flex sm:space-x-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-800 text-white shadow-sm border border-gray-700'
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
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-gray-300">System Online</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
