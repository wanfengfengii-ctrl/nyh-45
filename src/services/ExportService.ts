import type { SectionAnalysisResult } from '@/types'
import { profileToDataURL } from '@/renderers/ProfileRenderer'

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

export function downloadDataURL(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename)
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export interface SectionExportOptions {
  title?: string
}

export function exportSectionToPNG(
  result: SectionAnalysisResult,
  options: SectionExportOptions = {}
): boolean {
  const dataUrl = profileToDataURL(result, {
    title: options.title
  })
  if (!dataUrl) return false
  const filename = `${result.sectionName || 'section'}_剖面.png`
  downloadDataURL(dataUrl, filename)
  return true
}

export function exportSectionToJSON(result: SectionAnalysisResult): boolean {
  const content = JSON.stringify(result, null, 2)
  const filename = `${result.sectionName || 'section'}_分析结果.json`
  downloadFile(content, filename, 'application/json')
  return true
}

export function exportSectionBundle(
  result: SectionAnalysisResult,
  options: SectionExportOptions = {}
): boolean {
  const pngSuccess = exportSectionToPNG(result, options)
  const jsonSuccess = exportSectionToJSON(result)
  return pngSuccess && jsonSuccess
}

export interface BatchExportProgress {
  current: number
  total: number
  result: SectionAnalysisResult
}

export interface BatchExportOptions extends SectionExportOptions {
  formats?: ('png' | 'json')[]
  onProgress?: (progress: BatchExportProgress) => void
}

export function batchExportSections(
  results: SectionAnalysisResult[],
  options: BatchExportOptions = {}
): { success: number; failed: number } {
  const formats = options.formats ?? ['png', 'json']
  let success = 0
  let failed = 0

  results.forEach((result, index) => {
    try {
      let currentSuccess = true
      if (formats.includes('png')) {
        const pngOk = exportSectionToPNG(result, options)
        currentSuccess = currentSuccess && pngOk
      }
      if (formats.includes('json')) {
        const jsonOk = exportSectionToJSON(result)
        currentSuccess = currentSuccess && jsonOk
      }
      if (currentSuccess) {
        success++
      } else {
        failed++
      }
      if (options.onProgress) {
        options.onProgress({
          current: index + 1,
          total: results.length,
          result
        })
      }
    } catch {
      failed++
    }
  })

  return { success, failed }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}
