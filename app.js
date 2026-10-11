document.addEventListener('DOMContentLoaded', () => {

            const state = {
                currentImageSrc: null,
                paletteCount: 6,
                detectedUniqueCount: 0,
                currentFormat: 'hex',
                extractedColors: [],
                dominantColor: null,
                zoomLevel: 1
            };

            let colorThief;
            try {
                const CT = (window.ColorThief && window.ColorThief.default) || window.ColorThief || ColorThief;
                colorThief = new CT();
            } catch (e) {
                console.warn("ColorThief loading fallback ready:", e);
            }

            // DOM Elements
            const dropzone = document.getElementById('dropzone');
            const fileInput = document.getElementById('file-input');
            const sourceImg = document.getElementById('source-img');
            const focusSourceImg = document.getElementById('focus-source-img');
            const uploadPlaceholder = document.getElementById('upload-placeholder');
            const previewContainer = document.getElementById('preview-container');
            const imgDimensions = document.getElementById('img-dimensions');
            const btnChangeImg = document.getElementById('btn-change-img');
            const btnClearImg = document.getElementById('btn-clear-img');
            const urlInput = document.getElementById('url-input');
            const btnLoadUrl = document.getElementById('btn-load-url');

            // Zoom Controls
            const zoomWrapper = document.getElementById('zoom-wrapper');
            const zoomToolbar = document.getElementById('zoom-toolbar');
            const btnZoomIn = document.getElementById('btn-zoom-in');
            const btnZoomOut = document.getElementById('btn-zoom-out');
            const btnZoomReset = document.getElementById('btn-zoom-reset');
            const zoomLevelText = document.getElementById('zoom-level-text');

            // Focus Mode Elements
            const btnFocusMode = document.getElementById('btn-focus-mode');
            const focusModal = document.getElementById('focus-modal');
            const btnCloseFocus = document.getElementById('btn-close-focus');

            // Loupe & Tooltip Elements
            const hoverTooltip = document.getElementById('hover-eyedropper-tooltip');
            const hoverHexCode = document.getElementById('hover-hex-code');
            const hoverRgbCode = document.getElementById('hover-rgb-code');
            const magnifierCanvas = document.getElementById('magnifier-canvas');
            const magCtx = magnifierCanvas.getContext('2d');
            
            const hoverCanvas = document.createElement('canvas');
            const hoverCtx = hoverCanvas.getContext('2d', { willReadFrequently: true });
            let currentHoverPixel = null;

            // Settings & Controls
            const paletteSlider = document.getElementById('palette-slider');
            const colorCountVal = document.getElementById('color-count-val');
            const colorCountBadge = document.getElementById('color-count-badge');
            const maxLabelVal = document.getElementById('max-label-val');
            const sliderHintText = document.getElementById('slider-hint-text');
            const formatToggle = document.getElementById('format-toggle');

            // Swatches
            const swatchesGrid = document.getElementById('swatches-grid');
            const uniqueDetectedBadge = document.getElementById('unique-detected-badge');
            const toastContainer = document.getElementById('toast-container');

            function rgbToHex(r, g, b) {
                const toHex = c => {
                    const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                };
                return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
            }

            function rgbToHsl(r, g, b) {
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h, s, l = (max + min) / 2;

                if (max === min) {
                    h = s = 0;
                } else {
                    const d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }
                return {
                    h: Math.round(h * 360),
                    s: Math.round(s * 100),
                    l: Math.round(l * 100),
                    toString: () => `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
                };
            }

            function getLuminance(r, g, b) {
                const a = [r, g, b].map(v => {
                    v /= 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
            }

            function colorDistanceRGB(rgb1, rgb2) {
                const rdiff = rgb1[0] - rgb2[0];
                const gdiff = rgb1[1] - rgb2[1];
                const bdiff = rgb1[2] - rgb2[2];
                return Math.sqrt(0.3 * rdiff * rdiff + 0.59 * gdiff * gdiff + 0.11 * bdiff * bdiff);
            }

            function deduplicateColors(paletteArray, threshold = 22) {
                const unique = [];
                paletteArray.forEach(color => {
                    const isDuplicate = unique.some(u => colorDistanceRGB(u, color) < threshold);
                    if (!isDuplicate) {
                        unique.push(color);
                    }
                });
                return unique;
            }

            function scanTotalUniqueColors(imgEl) {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    const scale = 140;
                    canvas.width = scale;
                    canvas.height = scale;
                    ctx.drawImage(imgEl, 0, 0, scale, scale);
                    const imageData = ctx.getImageData(0, 0, scale, scale).data;

                    const samples = [];
                    for (let i = 0; i < imageData.length; i += 12) {
                        const r = imageData[i];
                        const g = imageData[i + 1];
                        const b = imageData[i + 2];
                        const a = imageData[i + 3];
                        if (a > 128) {
                            samples.push([r, g, b]);
                        }
                    }

                    const distinctClusters = deduplicateColors(samples, 26);
                    return Math.max(1, distinctClusters.length);
                } catch (e) {
                    console.warn("Scan unique colors fallback:", e);
                    return 20;
                }
            }

            function isDarkColor(r, g, b) {
                return getLuminance(r, g, b) < 0.45;
            }

            function showToast(message, type = 'success') {
                const toast = document.createElement('div');
                toast.className = 'copy-toast px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-medium shadow-2xl flex items-center gap-2';
                const icon = type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-info text-purple-400';
                toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
                
                toastContainer.appendChild(toast);
                setTimeout(() => {
                    toast.remove();
                }, 2200);
            }

            function copyTextToClipboard(text, successMsg) {
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(() => {
                        showToast(successMsg || `Berhasil menyalin ${text}`);
                    }).catch(() => fallbackCopy(text, successMsg));
                } else {
                    fallbackCopy(text, successMsg);
                }
            }

            function fallbackCopy(text, successMsg) {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    showToast(successMsg || `Berhasil menyalin ${text}`);
                } catch (err) {
                    showToast('Gagal menyalin', 'error');
                }
                document.body.removeChild(textArea);
            }

            function extractPaletteFromImage(imgEl) {
                try {
                    if (!imgEl.complete || imgEl.naturalWidth === 0) return;

                    const totalUniqueInImage = scanTotalUniqueColors(imgEl);
                    state.detectedUniqueCount = totalUniqueInImage;
                    uniqueDetectedBadge.innerText = `Terdeteksi ${totalUniqueInImage} Warna Unik`;
                    uniqueDetectedBadge.classList.remove('hidden');

                    const maxAllowed = Math.min(30, Math.max(1, totalUniqueInImage));
                    paletteSlider.max = maxAllowed;
                    maxLabelVal.innerText = maxAllowed;

                    if (state.paletteCount > maxAllowed) {
                        state.paletteCount = maxAllowed;
                        paletteSlider.value = maxAllowed;
                    }

                    colorCountVal.innerText = state.paletteCount;
                    colorCountBadge.innerText = `${state.paletteCount} Warna`;

                    if (totalUniqueInImage < 30) {
                        sliderHintText.innerText = `Gambar memiliki ${totalUniqueInImage} warna unik. Slider dibatasi hingga ${maxAllowed}.`;
                    } else {
                        sliderHintText.innerText = `Slider dapat diatur hingga 30 warna swatch.`;
                    }

                    let dominantRgb = null;
                    let rawPalette = [];

                    try {
                        dominantRgb = colorThief.getColor(imgEl);
                        const candidatePalette = colorThief.getPalette(imgEl, 40) || [];
                        rawPalette = deduplicateColors([dominantRgb, ...candidatePalette], 20);
                    } catch (corsErr) {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = 120;
                        canvas.height = 120;
                        ctx.drawImage(imgEl, 0, 0, 120, 120);
                        const imageData = ctx.getImageData(0, 0, 120, 120).data;
                        
                        const colorCounts = {};
                        for (let i = 0; i < imageData.length; i += 12) {
                            const r = Math.round(imageData[i] / 12) * 12;
                            const g = Math.round(imageData[i+1] / 12) * 12;
                            const b = Math.round(imageData[i+2] / 12) * 12;
                            const key = `${r},${g},${b}`;
                            colorCounts[key] = (colorCounts[key] || 0) + 1;
                        }

                        const sortedColors = Object.keys(colorCounts).sort((a,b) => colorCounts[b] - colorCounts[a]);
                        const candidates = sortedColors.map(k => k.split(',').map(Number));
                        rawPalette = deduplicateColors(candidates, 20);
                        dominantRgb = rawPalette[0] || [40, 40, 50];
                    }

                    if (!rawPalette || rawPalette.length === 0) return;

                    const finalPalette = rawPalette.slice(0, state.paletteCount);

                    const processColor = ([r, g, b]) => {
                        const hex = rgbToHex(r, g, b);
                        const hslObj = rgbToHsl(r, g, b);
                        return {
                            r: r, g: g, b: b,
                            hex: hex,
                            rgbStr: `rgb(${r}, ${g}, ${b})`,
                            hslStr: hslObj.toString(),
                            hslObj: hslObj,
                            luminance: getLuminance(r, g, b).toFixed(2),
                            isDark: isDarkColor(r, g, b)
                        };
                    };

                    state.dominantColor = processColor(dominantRgb || finalPalette[0]);
                    state.extractedColors = finalPalette.map(processColor);

                    updateUI();

                } catch (err) {
                    console.error("Palette Extraction Error:", err);
                    showToast("Gagal mengekstrak warna", "error");
                }
            }

            function updateUI() {
                if (!state.dominantColor || state.extractedColors.length === 0) return;

                // Reveal dominant content, hide empty state (first successful extraction)
                const domEmpty = document.getElementById('dominant-empty-state');
                const domContent = document.getElementById('dominant-content');
                if (domEmpty && !domEmpty.classList.contains('hidden')) {
                    domEmpty.classList.add('hidden');
                }
                if (domContent && domContent.classList.contains('hidden')) {
                    domContent.classList.remove('hidden');
                }

                // Update Dominant Color Card
                const domCard = document.getElementById('dominant-card');
                const domBadge = document.getElementById('dominant-badge');
                const domRgbBtn = document.getElementById('btn-copy-dominant-rgb');
                const domHexText = document.getElementById('dominant-hex-text');
                const domRgbText = document.getElementById('dominant-rgb-text');
                const domHslText = document.getElementById('dominant-hsl-text');
                const domLumText = document.getElementById('dominant-lum-text');

                const domColor = state.dominantColor;
                domCard.style.backgroundColor = domColor.hex;

                const isDark = domColor.isDark;
                domCard.style.color = isDark ? '#ffffff' : '#09090b';

                if (isDark) {
                    domBadge.className = 'text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-black/30 backdrop-blur-md text-white';
                    domRgbBtn.className = 'px-2.5 py-1 rounded-xl bg-black/30 hover:bg-black/50 backdrop-blur-md text-[11px] font-mono font-medium text-white transition flex items-center gap-1.5 shadow-sm border border-white/20';
                } else {
                    domBadge.className = 'text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-black/10 backdrop-blur-md text-zinc-900';
                    domRgbBtn.className = 'px-2.5 py-1 rounded-xl bg-black/10 hover:bg-black/20 backdrop-blur-md text-[11px] font-mono font-medium text-zinc-900 transition flex items-center gap-1.5 shadow-sm border border-black/10';
                }

                domHexText.innerText = domColor.hex;
                domRgbText.innerText = domColor.rgbStr;
                domHslText.innerText = domColor.hslStr;
                domLumText.innerText = `Luminance: ${domColor.luminance}`;

                domHexText.onclick = () => copyTextToClipboard(domColor.hex, `Disalin HEX ${domColor.hex}`);
                domRgbBtn.onclick = () => copyTextToClipboard(domColor.rgbStr, `Disalin RGB ${domColor.rgbStr}`);

                // Update Harmony Ribbon
                const harmonyRibbon = document.getElementById('harmony-ribbon');
                harmonyRibbon.innerHTML = '';
                state.extractedColors.forEach((color) => {
                    const stripe = document.createElement('div');
                    stripe.className = 'h-full flex-1 transition-all hover:flex-[1.6] cursor-pointer relative group';
                    stripe.style.backgroundColor = color.hex;
                    stripe.title = `${color.hex} (${color.rgbStr})`;
                    stripe.onclick = () => copyTextToClipboard(color.hex, `Disalin ${color.hex}`);
                    harmonyRibbon.appendChild(stripe);
                });

                // Extracted Swatches Grid
                swatchesGrid.innerHTML = '';
                state.extractedColors.forEach((color, idx) => {
                    const card = document.createElement('div');
                    card.className = 'group relative bg-zinc-900/80 rounded-xl p-2 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col gap-2 hover:shadow-lg cursor-pointer shrink-0 h-auto';

                    let displayCode = color.hex;
                    if (state.currentFormat === 'rgb') displayCode = color.rgbStr;
                    if (state.currentFormat === 'hsl') displayCode = color.hslStr;

                    card.innerHTML = `
                        <div class="h-16 w-full rounded-lg relative overflow-hidden shadow-inner flex items-end p-1.5 transition hover:scale-[1.01]" style="background-color: ${color.hex}">
                            <span class="text-[8px] font-mono font-semibold px-1 py-0.5 rounded backdrop-blur-md transition opacity-0 group-hover:opacity-100" style="background-color: rgba(0,0,0,0.4); color: #ffffff;">
                                Salin
                            </span>
                        </div>
                        <div class="flex items-start justify-between">
                            <div class="flex flex-col min-w-0">
                                <span class="text-[11px] font-mono font-bold text-zinc-200 tracking-tight truncate">${displayCode}</span>
                                <span class="text-[9px] font-mono text-zinc-500">Warna #${idx + 1}</span>
                            </div>
                            <button class="w-5 h-5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-[9px] transition shrink-0" title="Salin Kode">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                        </div>
                    `;

                    card.addEventListener('click', () => {
                        copyTextToClipboard(displayCode, `Disalin ${displayCode}!`);
                    });

                    swatchesGrid.appendChild(card);
                });
            }

            function applyZoom(scale) {
                state.zoomLevel = scale;
                zoomWrapper.style.transform = `scale(${scale})`;
                zoomLevelText.innerText = `${Math.round(scale * 100)}%`;
            }

            function loadImageSource(srcUrl, isRetry = false) {
                state.currentImageSrc = srcUrl;
                imgDimensions.innerText = "Memuat...";

                const isExternal = srcUrl.startsWith('http://') || srcUrl.startsWith('https://');

                if (isExternal) {
                    sourceImg.crossOrigin = "anonymous";
                    focusSourceImg.crossOrigin = "anonymous";
                } else {
                    sourceImg.removeAttribute('crossorigin');
                    focusSourceImg.removeAttribute('crossorigin');
                }

                sourceImg.src = srcUrl;
                focusSourceImg.src = srcUrl;

                sourceImg.onload = () => {
                    uploadPlaceholder.classList.add('hidden');
                    previewContainer.classList.remove('hidden');
                    zoomToolbar.classList.remove('hidden');

                    // Switch from centered mode to full two-column layout
                    document.getElementById('app-grid').classList.remove('centered-mode');
                    document.getElementById('settings-card').classList.remove('hidden');
                    document.getElementById('results-column').classList.remove('hidden');

                    imgDimensions.innerText = `${sourceImg.naturalWidth} × ${sourceImg.naturalHeight}px`;

                    applyZoom(1);

                    hoverCanvas.width = sourceImg.naturalWidth;
                    hoverCanvas.height = sourceImg.naturalHeight;
                    try {
                        hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);
                        hoverCtx.drawImage(sourceImg, 0, 0, hoverCanvas.width, hoverCanvas.height);
                    } catch (e) {
                        console.warn("Offscreen canvas draw failed:", e);
                    }

                    extractPaletteFromImage(sourceImg);
                };

                sourceImg.onerror = () => {
                    if (isExternal && !isRetry && !srcUrl.includes('images.weserv.nl')) {
                        imgDimensions.innerText = "Bypass CORS...";
                        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(srcUrl)}`;
                        loadImageSource(proxyUrl, true);
                        return;
                    }

                    imgDimensions.innerText = "Gagal";
                    showToast("Gagal memuat URL gambar (CORS / Link Rusak)", "error");
                };
            }

            function setupHoverInspector(targetImgEl) {
                targetImgEl.addEventListener('mousemove', (e) => {
                    if (!hoverCanvas.width || !hoverCanvas.height) return;

                    const rect = targetImgEl.getBoundingClientRect();
                    const xRatio = hoverCanvas.width / rect.width;
                    const yRatio = hoverCanvas.height / rect.height;

                    const imgX = Math.floor((e.clientX - rect.left) * xRatio);
                    const imgY = Math.floor((e.clientY - rect.top) * yRatio);

                    if (imgX >= 0 && imgX < hoverCanvas.width && imgY >= 0 && imgY < hoverCanvas.height) {
                        try {
                            const pixel = hoverCtx.getImageData(imgX, imgY, 1, 1).data;
                            const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
                            const rgbStr = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                            
                            currentHoverPixel = { hex, rgbStr };

                            magCtx.imageSmoothingEnabled = false;
                            magCtx.clearRect(0, 0, 11, 11);
                            magCtx.drawImage(
                                hoverCanvas,
                                Math.max(0, imgX - 5), Math.max(0, imgY - 5), 11, 11,
                                0, 0, 11, 11
                            );

                            hoverHexCode.innerText = hex;
                            hoverRgbCode.innerText = rgbStr;
                            hoverTooltip.classList.remove('hidden');

                            const tooltipWidth = hoverTooltip.offsetWidth || 100;
                            const tooltipHeight = hoverTooltip.offsetHeight || 140;
                            const gap = 16;
                            const vw = window.innerWidth;
                            const vh = window.innerHeight;

                            let left = e.clientX - tooltipWidth / 2;
                            let top = e.clientY - tooltipHeight - gap;

                            if (e.clientX + tooltipWidth / 2 + 10 > vw) {
                                left = e.clientX - tooltipWidth - gap;
                            } else if (e.clientX - tooltipWidth / 2 - 10 < 0) {
                                left = e.clientX + gap;
                            }

                            if (e.clientY - tooltipHeight - gap < 10) {
                                top = e.clientY + gap + 10;
                            } else if (top + tooltipHeight > vh - 10) {
                                top = vh - tooltipHeight - 10;
                            }

                            left = Math.max(10, Math.min(vw - tooltipWidth - 10, left));

                            hoverTooltip.style.left = `${left}px`;
                            hoverTooltip.style.top = `${top}px`;

                        } catch (err) {
                            hoverTooltip.classList.add('hidden');
                        }
                    } else {
                        hoverTooltip.classList.add('hidden');
                    }
                });

                targetImgEl.addEventListener('mouseleave', () => {
                    hoverTooltip.classList.add('hidden');
                    currentHoverPixel = null;
                });

                targetImgEl.addEventListener('click', (e) => {
                    if (currentHoverPixel) {
                        e.stopPropagation();
                        copyTextToClipboard(currentHoverPixel.hex, `Hex ${currentHoverPixel.hex} Disalin!`);
                    }
                });
            }

            setupHoverInspector(sourceImg);
            setupHoverInspector(focusSourceImg);

            // Zoom Toolbar Listeners
            btnZoomIn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.zoomLevel < 3) applyZoom(state.zoomLevel + 0.5);
            });

            btnZoomOut.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.zoomLevel > 0.5) applyZoom(state.zoomLevel - 0.25);
            });

            btnZoomReset.addEventListener('click', (e) => {
                e.stopPropagation();
                applyZoom(1);
            });

            btnFocusMode.addEventListener('click', (e) => {
                e.stopPropagation();
                focusModal.classList.remove('hidden');
            });

            btnCloseFocus.addEventListener('click', () => {
                focusModal.classList.add('hidden');
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !focusModal.classList.contains('hidden')) {
                    focusModal.classList.add('hidden');
                }
            });

            dropzone.addEventListener('click', (e) => {
                if (e.target.closest('#zoom-toolbar') || e.target.closest('#btn-change-img') || e.target.closest('#btn-clear-img')) return;
                if (previewContainer.classList.contains('hidden')) {
                    fileInput.click();
                }
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => loadImageSource(evt.target.result);
                    reader.readAsDataURL(file);
                }
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropzone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                }, false);
            });

            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (evt) => loadImageSource(evt.target.result);
                        reader.readAsDataURL(file);
                    } else {
                        showToast("Harap pilih file gambar yang valid.", "error");
                    }
                }
            });

            btnClearImg.addEventListener('click', (e) => {
                e.stopPropagation();
                previewContainer.classList.add('hidden');
                zoomToolbar.classList.add('hidden');
                uploadPlaceholder.classList.remove('hidden');
                fileInput.value = '';
                urlInput.value = '';
                imgDimensions.innerText = "Siap";
                sourceImg.onerror = null;
                sourceImg.onload = null;
                sourceImg.src = '';
                focusSourceImg.src = '';
                hoverTooltip.classList.add('hidden');

                // Switch back to centered upload mode
                document.getElementById('app-grid').classList.add('centered-mode');
                document.getElementById('settings-card').classList.add('hidden');
                document.getElementById('results-column').classList.add('hidden');
                
                // Reset dominant card back to empty state
                const domEmpty = document.getElementById('dominant-empty-state');
                const domContent = document.getElementById('dominant-content');
                if (domEmpty) domEmpty.classList.remove('hidden');
                if (domContent) domContent.classList.add('hidden');
                // Clear swatches & harmony ribbon
                document.getElementById('swatches-grid').innerHTML = '';
                document.getElementById('harmony-ribbon').innerHTML = '';
                uniqueDetectedBadge.classList.add('hidden');
                // BUGFIX: reset the dominant card's background/text colors (were left over from the previous image)
                const domCard = document.getElementById('dominant-card');
                domCard.style.backgroundColor = '';
                domCard.style.color = '';
                domCard.classList.add('bg-zinc-900/60');
                domCard.classList.remove('border-white/10');
                domCard.classList.add('border-zinc-800');
            });

            btnChangeImg.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.click();
            });

            btnLoadUrl.addEventListener('click', () => {
                const url = urlInput.value.trim();
                if (url) {
                    loadImageSource(url);
                } else {
                    showToast("Harap masukkan URL yang valid", "error");
                }
            });

            urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btnLoadUrl.click();
            });

            paletteSlider.addEventListener('input', (e) => {
                state.paletteCount = parseInt(e.target.value);
                colorCountVal.innerText = state.paletteCount;
                colorCountBadge.innerText = `${state.paletteCount} Warna`;
                if (sourceImg.src && sourceImg.complete) {
                    extractPaletteFromImage(sourceImg);
                }
            });

            formatToggle.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    formatToggle.querySelectorAll('button').forEach(b => {
                        b.className = 'flex-1 py-1.5 rounded-lg text-xs font-mono font-medium transition text-zinc-400 hover:text-zinc-200';
                    });
                    btn.className = 'flex-1 py-1.5 rounded-lg text-xs font-mono font-medium transition bg-zinc-800 text-white shadow-sm';
                    state.currentFormat = btn.dataset.format;
                    updateUI();
                });
            });

        });
