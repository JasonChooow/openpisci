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
import { ArrowDown, ArrowUpRight, Sparkles } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import type { PricingModel } from '../types'

export type ModelCarouselProps = {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
}

const surfaceStyles = [
  'border-[#ecd6de] bg-[#fff5f7]',
  'border-[#d7e5dc] bg-[#f3faf5]',
  'border-[#d9e1ef] bg-[#f4f7fc]',
  'border-[#eadfbd] bg-[#fffaf0]',
  'border-[#ded8ef] bg-[#f8f5ff]',
]

const ModelSlide = memo(function ModelSlide(props: {
  model: PricingModel
  index: number
  onModelClick: (modelName: string) => void
}) {
  const { t } = useTranslation()
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const endpoint = props.model.supported_endpoint_types?.[0]

  return (
    <button
      type='button'
      onClick={() => props.onModelClick(props.model.model_name)}
      className={cn(
        'group flex h-[108px] w-[210px] shrink-0 flex-col justify-between rounded-lg border p-3.5 text-left transition-transform duration-200 hover:-translate-y-0.5 sm:h-[116px] sm:w-[230px] sm:p-4',
        surfaceStyles[props.index % surfaceStyles.length]
      )}
    >
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-white/80 shadow-sm'>
            {modelIcon || (
              <span className='text-sm font-black'>
                {props.model.model_name?.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <strong className='line-clamp-2 font-mono text-[15px] leading-5 font-black sm:text-base'>
            {props.model.model_name}
          </strong>
        </div>
        <ArrowUpRight className='text-foreground/35 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5' />
      </div>

      <div className='flex min-w-0 items-end justify-between gap-2'>
        <span className='text-foreground/50 truncate text-[10px] font-bold tracking-[0.08em] uppercase'>
          {props.model.vendor_name || t('Available Models')}
        </span>
        {endpoint && (
          <span className='text-foreground/45 shrink-0 font-mono text-[10px]'>
            {endpoint}
          </span>
        )}
      </div>
    </button>
  )
})

function CarouselRow(props: {
  models: PricingModel[]
  rowIndex: number
  onModelClick: (modelName: string) => void
}) {
  const animationDuration = Math.max(36, props.models.length * 4.2)
  const repeatedGroups = [0, 1]
  const [isPaused, setIsPaused] = useState(false)

  return (
    <div
      className='baozi-model-marquee'
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
      aria-label={
        props.rowIndex === 0 ? '自动轮播模型第一排' : '自动轮播模型第二排'
      }
    >
      <div
        className='baozi-model-marquee-track'
        style={{
          animationDuration: `${animationDuration}s`,
          animationDirection: props.rowIndex === 0 ? 'normal' : 'reverse',
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      >
        {repeatedGroups.map((groupIndex) => (
          <div
            key={groupIndex}
            className='baozi-model-marquee-group'
            aria-hidden={groupIndex === 1}
          >
            {props.models.map((model, index) => (
              <ModelSlide
                key={`${groupIndex}-${props.rowIndex}-${model.id ?? model.model_name}`}
                model={model}
                index={index + props.rowIndex * 3}
                onModelClick={props.onModelClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModelCarousel(props: ModelCarouselProps) {
  const { t } = useTranslation()
  const rows = useMemo(() => {
    if (props.models.length <= 6) return [props.models]
    const firstRow = props.models.filter((_, index) => index % 2 === 0)
    const secondRow = props.models.filter((_, index) => index % 2 === 1)
    return [firstRow, secondRow]
  }, [props.models])

  if (props.models.length === 0) return null

  return (
    <section className='overflow-hidden border-b pt-4 pb-12 sm:pt-8 sm:pb-16'>
      <div className='mx-auto max-w-3xl px-4 text-center'>
        <div className='border-border/70 bg-background mx-auto mb-7 flex w-fit max-w-full items-center gap-3 border px-3 py-2 shadow-sm sm:gap-4 sm:px-4'>
          <img
            src='/baozi-logo.png'
            alt='包子'
            className='size-8 shrink-0 rounded-md object-contain sm:size-9'
          />
          <span
            aria-hidden='true'
            className='text-muted-foreground text-sm font-medium'
          >
            ×
          </span>
          <span className='flex shrink-0 items-center gap-2'>
            <img
              src='/china-mobile-logo.png'
              alt=''
              className='size-7 object-contain sm:size-8'
            />
            <strong className='whitespace-nowrap text-sm font-black sm:text-base'>
              中国移动
            </strong>
          </span>
          <span className='border-border text-muted-foreground hidden border-l pl-4 text-left text-xs leading-5 sm:block'>
            战略合作
            <br />
            AI 算力服务
          </span>
        </div>

        <h1 className='text-4xl leading-tight font-black sm:text-5xl'>
          {t('Model Square')}
        </h1>
        <p className='text-muted-foreground mx-auto mt-5 max-w-2xl text-base leading-7 sm:text-lg'>
          {t(
            'Discover curated AI models, compare pricing and capabilities, and choose the right model for every scenario.'
          )}
        </p>
        <p className='text-muted-foreground/80 mt-2 text-xs sm:text-sm'>
          包子 × 中国移动战略合作，共同推进企业级 AI 算力服务与模型应用落地
        </p>
        <div className='border-border mt-5 inline-flex max-w-full items-center gap-2 border-y px-1 py-2 text-center text-sm leading-5 font-bold sm:text-base'>
          <Sparkles className='size-4 shrink-0 text-[#ff4f78]' />
          <span>
            全面覆盖全球最领先的{' '}
            <strong className='text-[#e73568]'>AI 模型生态</strong>
          </span>
        </div>
        <div className='mt-6'>
          <a
            href='#model-directory'
            className='border-border bg-background hover:bg-muted inline-flex h-9 items-center gap-2 border px-4 text-sm font-semibold transition-colors'
          >
            查看模型与价格
            <ArrowDown className='size-4' />
          </a>
        </div>
      </div>

      <div className='mt-9 space-y-3 sm:mt-12'>
        {rows.map((row, index) => (
          <CarouselRow
            key={row[0]?.model_name || `model-row-${rows.length}`}
            models={row}
            rowIndex={index}
            onModelClick={props.onModelClick}
          />
        ))}
      </div>
    </section>
  )
}
