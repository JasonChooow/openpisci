/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'

export const BAOZI_BRAND = {
  systemName: '包子',
  productName: '包子模型服务',
  productLine: '9X bot',
  logo: '/baozi-logo.png',
  mainSiteUrl: import.meta.env.VITE_MAIN_SITE_URL || 'http://127.0.0.1:5173/',
} as const

export function resolveBaoziSystemName(value?: string | null): string {
  const name = value?.trim()
  if (!name || name === DEFAULT_SYSTEM_NAME) return BAOZI_BRAND.systemName
  return name
}

export function resolveBaoziLogo(value?: string | null): string {
  return value?.trim() || BAOZI_BRAND.logo
}
