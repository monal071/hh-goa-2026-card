import { useEffect, useMemo, useRef, useState } from 'react'
import * as QRCode from 'qrcode'
import heic2any from 'heic2any'
import './App.css'

declare global {
  interface Window {
    FaceDetector?: any
  }
}

type CropState = {
  x: number
  y: number
  zoom: number
  flip: boolean
}

const builderTitles = [
  'TERMINAL WIZARD',
  'PRODUCT ALCHEMIST',
  'NIGHT-SHIFT ARCHITECT',
  'SYSTEMS NOMAD',
  'DEBUG SHAMAN',
  'PIXEL HACKER',
  'CLOUD PIRATE',
  'CODE CARTOGRAPHER',
  'FULL STACK ALCHEMIST',
  'SHIPPER IN THE MAKING',
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const formatSessionId = () => {
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `HHG26-${suffix}`
}

const createImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = async () => {
      try {
        if (image.decode) await image.decode()
      } catch {
        // ignore decode errors on older browsers
      }
      resolve(image)
    }
    image.onerror = (error) => reject(error)
    image.src = src
  })

const measureText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
) => {
  let size = initialSize
  ctx.font = `bold ${size}px Inter, system-ui, sans-serif`
  while (ctx.measureText(text).width > maxWidth && size > 18) {
    size -= 2
    ctx.font = `bold ${size}px Inter, system-ui, sans-serif`
  }
  return size
}

const getCropRect = (
  width: number,
  height: number,
  crop: CropState,
): { sx: number; sy: number; sw: number; sh: number } => {
  const square = Math.min(width, height)
  const size = clamp(square / crop.zoom, 120, square)
  const cx = crop.x * width
  const cy = crop.y * height
  let sx = cx - size / 2
  let sy = cy - size / 2

  if (sx < 0) sx = 0
  if (sy < 0) sy = 0
  if (sx + size > width) sx = width - size
  if (sy + size > height) sy = height - size

  return { sx, sy, sw: size, sh: size }
}

const drawPhotoCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  image: HTMLImageElement | null,
  crop: CropState,
) => {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  if (image) {
    const { sx, sy, sw, sh } = getCropRect(image.naturalWidth, image.naturalHeight, crop)
    ctx.save()
    if (crop.flip) {
      ctx.translate(x + size, y)
      ctx.scale(-1, 1)
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size)
    } else {
      ctx.drawImage(image, sx, sy, sw, sh, x, y, size, size)
    }
    ctx.restore()
  }
  // No placeholder fill — the template already shows the empty circle

  ctx.restore()
}

// ─── Template dimensions (native resolution of card-template.png) ───────────
// These are the reference coordinates used to position overlays.
// If your template is a different size, update TEMPLATE_W / TEMPLATE_H and
// re-tune the percentage values below.
const TEMPLATE_SRC = '/card-template.png'
const TEMPLATE_W = 630   // px  (adjust to your actual image width)
const TEMPLATE_H = 1000  // px  (adjust to your actual image height)
const DEBUG_TEMPLATE_ONLY = false

// Overlay positions expressed as fractions of TEMPLATE_W / TEMPLATE_H
// so they scale correctly at any canvas resolution.
//
// Measured from the reference card image:
//   • Photo circle centre ≈ 50 % across, 26 % down; diameter ≈ 34 % of width
//   • Name baseline       ≈ 52 % down
//   • ID text             ≈ 9.5 % across, 74.5 % down
//   • QR code top-left    ≈ 68 % across, 68 % down; size ≈ 22 % of width
const PHOTO_CX  = 0.50   // centre-x fraction
const PHOTO_CY  = 0.265  // centre-y fraction
const PHOTO_D   = 0.345  // diameter fraction

const NAME_Y    = 0.515  // baseline-y fraction
const NAME_SIZE = 0.048  // font-size fraction of width

const ID_X      = 0.095  // left-x fraction
const ID_Y      = 0.745  // baseline-y fraction
const ID_SIZE   = 0.030  // font-size fraction of width

const QR_X      = 0.675  // left-x fraction
const QR_Y      = 0.675  // top-y fraction
const QR_SIZE   = 0.225  // size fraction of width

const drawBuilderCard = async (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  template: HTMLImageElement | null,
  options: {
    image: HTMLImageElement | null
    crop: CropState
    displayName: string
    displayRole: string
    displayTitle: string
    displayId: string
    qrDataUrl: string | null
  },
) => {
  ctx.clearRect(0, 0, width, height)

  // Layer 1 — exact template image
  if (template) {
    ctx.drawImage(template, 0, 0, width, height)
  } else {
    ctx.fillStyle = '#f2e7cd'
    ctx.fillRect(0, 0, width, height)
  }

  // Layer 2 — user photo clipped to the existing circular placeholder
  const photoDiameter = width * PHOTO_D
  const photoX = width * PHOTO_CX - photoDiameter / 2
  const photoY = height * PHOTO_CY - photoDiameter / 2
  if (options.image) {
    drawPhotoCircle(ctx, photoX, photoY, photoDiameter, options.image, options.crop)
  }

  // Layer 3 — name text
  const nameFontSize = measureText(
    ctx,
    options.displayName,
    width * 0.78,
    Math.round(width * NAME_SIZE),
  )
  ctx.fillStyle = '#1d3f2d'
  ctx.font = `800 ${nameFontSize}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(options.displayName, width / 2, height * NAME_Y)

  // Layer 4 — builder title and role
  const titleFontSize = measureText(ctx, options.displayTitle, width * 0.72, Math.round(width * 0.035))
  ctx.fillStyle = '#1f4b34'
  ctx.font = `700 ${titleFontSize}px Inter, system-ui, sans-serif`
  ctx.fillText(options.displayTitle, width / 2, height * (NAME_Y + 0.055))

  if (options.displayRole) {
    const roleFontSize = measureText(ctx, options.displayRole, width * 0.72, Math.round(width * 0.028))
    ctx.fillStyle = '#49644c'
    ctx.font = `600 ${roleFontSize}px Inter, system-ui, sans-serif`
    ctx.fillText(options.displayRole, width / 2, height * (NAME_Y + 0.095))
  }

  // Layer 5 — builder ID
  const idFontSize = Math.round(width * ID_SIZE)
  ctx.fillStyle = '#1c3f2f'
  ctx.textAlign = 'left'
  ctx.font = `800 ${idFontSize}px Inter, system-ui, sans-serif`
  ctx.fillText(options.displayId, width * ID_X, height * ID_Y)

  // Layer 6 — QR code
  if (options.qrDataUrl) {
    const qrSize = width * QR_SIZE
    const qrImage = await createImage(options.qrDataUrl)
    ctx.drawImage(qrImage, width * QR_X, height * QR_Y, qrSize, qrSize)
  }
}

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<CropState>({ x: 0.5, y: 0.5, zoom: 1.2, flip: false })
  const [detectedCrop, setDetectedCrop] = useState<CropState>({ x: 0.5, y: 0.5, zoom: 1.2, flip: false })
  const [cropStatus, setCropStatus] = useState('AI: SUBJECT READY')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [builderId, setBuilderId] = useState('')
  const [title, setTitle] = useState(builderTitles[0])
  const [statusMessage, setStatusMessage] = useState('Upload a photo and start styling your Goa ID.')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const [processingDrop, setProcessingDrop] = useState(false)
  const [templateImg, setTemplateImg] = useState<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const generatedId = useMemo(formatSessionId, [])

  const displayId = builderId.trim() || generatedId
  const displayName = name.trim() || 'JAL PATEL'
  const displayRole = role.trim() || 'FULL STACK DEVELOPER'
  const displayTitle = title || builderTitles[0]

  // Load the card template once on mount
  useEffect(() => {
    createImage(TEMPLATE_SRC)
      .then((img) => {
        console.log('ID TEMPLATE LOADED:', TEMPLATE_SRC)
        console.log('ID TEMPLATE SIZE:', `${img.naturalWidth}x${img.naturalHeight}`)
        console.log('ID TEMPLATE COMPLETE:', img.complete)
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          console.error('ID TEMPLATE FAILED TO LOAD CORRECTLY: natural dimensions are zero')
        }
        setTemplateImg(img)
      })
      .catch((error) => {
        console.error('ID TEMPLATE LOAD FAILED:', TEMPLATE_SRC, error)
        setTemplateImg(null)
      })
  }, [])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setProcessingDrop(true)
    try {
      const file = files[0]
      let blob: Blob = file
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.heic') || lower.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
        try {
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
          blob = converted as Blob
        } catch (error) {
          console.warn('HEIC conversion failed', error)
        }
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setImageSrc(url)
      setStatusMessage('Preparing your crop and smart preview...')
      setExported(false)
    } finally {
      setProcessingDrop(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files)

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    handleFiles(event.dataTransfer.files)
  }

  const handleResetCrop = () => setCrop((prev) => ({ ...detectedCrop, flip: prev.flip }))

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  // Face detection / smart crop
  useEffect(() => {
    if (!imageSrc) {
      setCropStatus('AI: SUBJECT READY')
      return
    }
    let active = true
    const runDetection = async () => {
      setCropStatus('DETECTING SUBJECT…')
      try {
        const image = await createImage(imageSrc)
        if (!active) return

        if ('FaceDetector' in window) {
          try {
            const detector = new window.FaceDetector()
            const results = await detector.detect(image)
            if (!active) return
            if (results.length && results[0]?.boundingBox) {
              const box = results[0].boundingBox
              const x = clamp((box.x + box.width / 2) / image.naturalWidth, 0.1, 0.9)
              const y = clamp((box.y + box.height / 2) / image.naturalHeight, 0.1, 0.9)
              const sizeEstimate = Math.max(box.width, box.height)
              const zoom = clamp(
                Math.min(2.2, Math.max(1.1, Math.min(image.naturalWidth, image.naturalHeight) / sizeEstimate * 0.9)),
                1,
                2.4,
              )
              const newCrop = { x, y, zoom, flip: crop.flip }
              setCrop(newCrop)
              setDetectedCrop(newCrop)
              setCropStatus('AI: SUBJECT DETECTED')
              setStatusMessage('The subject is ready. Fine-tune position, zoom, or flip.')
              return
            }
          } catch (error) {
            console.warn('FaceDetector failed', error)
          }
        }

        const fallbackCrop = { x: 0.5, y: 0.5, zoom: 1.2, flip: crop.flip }
        setCrop(fallbackCrop)
        setDetectedCrop(fallbackCrop)
        setCropStatus('SMART CROP READY')
        setStatusMessage('No subject was detected, but your photo is centered and ready.')
      } catch (error) {
        console.warn('Image load failed', error)
        setStatusMessage('Could not load that image. Try a JPG or PNG file.')
        setCropStatus('UPLOAD A PHOTO')
      }
    }
    runDetection()
    return () => { active = false }
  }, [imageSrc])

  // QR code generation
  useEffect(() => {
    const text = `HH GOA 2026 | ${displayId} | ${displayName}`
    let active = true
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 360 })
      .then((url) => { if (active) setQrDataUrl(url) })
      .catch(() => { if (active) setQrDataUrl(null) })
    return () => { active = false }
  }, [displayId, displayName])

  // Canvas render — uses template aspect ratio so the card is never distorted
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!templateImg || !templateImg.complete || templateImg.naturalWidth === 0 || templateImg.naturalHeight === 0) {
      console.warn('Template image is not ready yet; skipping render', templateImg)
      return
    }

    // Match canvas to template native resolution
    const tw = templateImg.naturalWidth
    const th = templateImg.naturalHeight
    canvas.width = tw
    canvas.height = th
    console.log('CANVAS SIZE:', `${canvas.width}x${canvas.height}`)

    let active = true
    const render = async () => {
      if (DEBUG_TEMPLATE_ONLY) {
        ctx.clearRect(0, 0, tw, th)
        ctx.drawImage(templateImg, 0, 0, tw, th)
      } else {
        const currentImage = imageSrc ? await createImage(imageSrc).catch(() => null) : null
        if (!active) return
        await drawBuilderCard(ctx, tw, th, templateImg, {
          image: currentImage,
          crop,
          displayName,
          displayRole,
          displayTitle,
          displayId,
          qrDataUrl,
        })
      }
      if (active) setStatusMessage('Live preview is ready. Export your badge when you\'re happy.')
    }
    render()
    return () => { active = false }
  }, [imageSrc, crop, displayName, displayRole, displayTitle, displayId, qrDataUrl, templateImg])

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${displayId.replace(/\s+/g, '_')}_HHGoaID.png`
    link.click()
    setExported(true)
    setTimeout(() => setExported(false), 2600)
  }

  const handleShare = () => {
    const text = `Just got my HH Goa 2026 Builder ID 🌴⚡%0AI'm a ${title}.%0A%23FrameInGoa`
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="appShell">
      <header className="heroHeader">
        <div className="heroCopy">
          <span className="eyebrow">HACKER HOUSE</span>
          <h1>Build your Goa ID</h1>
          <p>Turn your photo into a premium HH Goa 2026 builder identity—fast, on-device, and share-ready.</p>
          <div className="heroActions">
            <button type="button" className="primaryButton" onClick={() => document.getElementById('upload-input')?.click()}>
              Create my ID
            </button>
          </div>
        </div>
        <div className="heroGraphic">
          <div className="heroBadge">
            <span>HH GOA</span>
            <strong>2026</strong>
          </div>
        </div>
      </header>

      <main className="mainGrid">
        <section className="panel panelLeft">
          <div className="panelHeader">
            <p className="sectionLabel">1. Upload your photo</p>
            <h2>Photo & crop</h2>
          </div>

          <label
            htmlFor="upload-input"
            className={`dropzone ${processingDrop ? 'dropzone--active' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              id="upload-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/heic,image/heif"
              onChange={handleFileChange}
            />
            <div>
              <span className="dropIcon">📸</span>
              <strong>Drag & drop your JPG, PNG or HEIC</strong>
              <small>Upload a portrait, landscape, or off-center photo. We'll auto-crop it for you.</small>
            </div>
          </label>

          <div className="cropStatus">
            <div><span>{cropStatus}</span></div>
            <p>{statusMessage}</p>
          </div>

          <div className="cropPanel">
            <div className="cropPanel__title">ADJUST PHOTO</div>
            <div className="sliderRow">
              <label className="sliderLabel">ZOOM</label>
              <input
                type="range" min="1" max="2.4" step="0.01"
                value={crop.zoom}
                onChange={(e) => setCrop((prev) => ({ ...prev, zoom: Number(e.target.value) }))}
              />
            </div>
            <div className="sliderRow">
              <label className="sliderLabel">LEFT / RIGHT</label>
              <input
                type="range" min="0" max="100"
                value={Math.round(crop.x * 100)}
                onChange={(e) => setCrop((prev) => ({ ...prev, x: Number(e.target.value) / 100 }))}
              />
            </div>
            <div className="sliderRow">
              <label className="sliderLabel">UP / DOWN</label>
              <input
                type="range" min="0" max="100"
                value={Math.round(crop.y * 100)}
                onChange={(e) => setCrop((prev) => ({ ...prev, y: Number(e.target.value) / 100 }))}
              />
            </div>
            <div className="buttonRow">
              <button type="button" className="secondaryButton" onClick={handleResetCrop}>Reset</button>
              <button type="button" className="secondaryButton" onClick={() => setCrop((prev) => ({ ...prev, flip: !prev.flip }))}>Flip</button>
            </div>
          </div>
        </section>

        <section className="panel panelRight">
          <div className="panelHeader">
            <p className="sectionLabel">2. Builder details</p>
            <h2>Identity</h2>
          </div>

          <div className="formGrid">
            <label>
              <span>Name</span>
              <input
                type="text" placeholder="JAL PATEL"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              <span>Builder title</span>
              <select value={title} onChange={(e) => setTitle(e.target.value)}>
                {builderTitles.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Builder ID</span>
              <input
                type="text" placeholder={generatedId}
                value={builderId}
                onChange={(e) => setBuilderId(e.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="previewBlock">
            <div className="previewLabel">
              <span>Live preview</span>
              <strong>Builder ID card</strong>
            </div>
            <div className="previewWrapper">
              <canvas ref={canvasRef} className="previewCanvas" aria-label="Live card preview" />
            </div>
          </div>

          <div className="exportButtons">
            <button type="button" className="primaryButton" onClick={handleDownload}>Download PNG</button>
            <button type="button" className="secondaryButton" onClick={handleShare}>Share to X</button>
          </div>
          {exported && <p className="successMessage">Your HH Goa card is ready to share! 🌴</p>}
        </section>
      </main>
    </div>
  )
}

export default App
