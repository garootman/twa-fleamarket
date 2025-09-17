import { useState, useEffect, useRef } from 'react';
import { Button } from './ui';

export interface ImageGalleryProps {
  images: string[];
  currentIndex?: number;
  onClose?: () => void;
  onImageChange?: (index: number) => void;
  className?: string;
  showThumbnails?: boolean;
  enableSwipe?: boolean;
  enableZoom?: boolean;
}

export function ImageGallery({
  images,
  currentIndex = 0,
  onClose,
  onImageChange,
  className = '',
  showThumbnails = true,
  enableSwipe = true,
  enableZoom = false,
}: ImageGalleryProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number; time: number } | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    onImageChange?.(activeIndex);
  }, [activeIndex, onImageChange]);

  const goToNext = () => {
    setActiveIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
    resetZoom();
  };

  const goToPrevious = () => {
    setActiveIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
    resetZoom();
  };

  const goToImage = (index: number) => {
    setActiveIndex(index);
    resetZoom();
  };

  const resetZoom = () => {
    setIsZoomed(false);
    setZoomLevel(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!enableZoom) return;

    if (!isZoomed) {
      setIsZoomed(true);
      setZoomLevel(2);

      // Calculate zoom position based on click position
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * -100;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * -100;
      setZoomPosition({ x, y });
    } else {
      resetZoom();
    }
  };

  const handleDoubleClick = () => {
    if (!enableZoom) return;

    if (zoomLevel < 3) {
      setZoomLevel(zoomLevel + 1);
    } else {
      resetZoom();
    }
  };

  // Touch/Mouse drag handling for zoomed images
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isZoomed) return;
    e.preventDefault();
    setDragStart({ x: e.clientX - zoomPosition.x, y: e.clientY - zoomPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart || !isZoomed) return;
    e.preventDefault();
    setZoomPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setDragStart(null);
  };

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableSwipe || isZoomed) return;

    const touch = e.touches[0];
    setSwipeStart({
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!enableSwipe || !swipeStart || isZoomed) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    const deltaTime = Date.now() - swipeStart.time;

    // Only trigger swipe if it's horizontal, fast enough, and long enough
    if (
      Math.abs(deltaX) > 50 && // Minimum swipe distance
      Math.abs(deltaX) > Math.abs(deltaY) * 2 && // More horizontal than vertical
      deltaTime < 300 // Maximum swipe time
    ) {
      if (deltaX > 0) {
        goToPrevious();
      } else {
        goToNext();
      }
    }

    setSwipeStart(null);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose?.();
          break;
        case ' ':
          e.preventDefault();
          if (enableZoom) {
            if (isZoomed) {
              resetZoom();
            } else {
              setIsZoomed(true);
              setZoomLevel(2);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isZoomed, enableZoom]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <span className="text-gray-500">No images available</span>
      </div>
    );
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`} ref={containerRef}>
      {/* Main Image */}
      <div className="relative aspect-square md:aspect-video bg-black flex items-center justify-center">
        <img
          ref={imageRef}
          src={images[activeIndex]}
          alt={`Image ${activeIndex + 1} of ${images.length}`}
          className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
            isZoomed ? 'cursor-move' : enableZoom ? 'cursor-zoom-in' : 'cursor-pointer'
          }`}
          style={{
            transform: isZoomed
              ? `scale(${zoomLevel}) translate(${zoomPosition.x / zoomLevel}px, ${zoomPosition.y / zoomLevel}px)`
              : 'scale(1)',
            transformOrigin: 'center',
          }}
          onClick={handleImageClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          draggable={false}
        />

        {/* Navigation Arrows */}
        {images.length > 1 && !isZoomed && (
          <>
            <button
              onClick={e => {
                e.stopPropagation();
                goToPrevious();
              }}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity z-10"
              aria-label="Previous image"
            >
              ←
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity z-10"
              aria-label="Next image"
            >
              →
            </button>
          </>
        )}

        {/* Image Counter */}
        <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-10">
          {activeIndex + 1} / {images.length}
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 left-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity z-10"
            aria-label="Close gallery"
          >
            ✕
          </button>
        )}

        {/* Zoom Controls */}
        {enableZoom && (
          <div className="absolute bottom-2 left-2 flex space-x-1 z-10">
            <button
              onClick={e => {
                e.stopPropagation();
                if (zoomLevel > 1) {
                  setZoomLevel(Math.max(1, zoomLevel - 0.5));
                } else {
                  resetZoom();
                }
              }}
              className="bg-black bg-opacity-50 text-white p-1 rounded hover:bg-opacity-70 transition-opacity text-sm"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                if (!isZoomed) {
                  setIsZoomed(true);
                  setZoomLevel(2);
                } else {
                  setZoomLevel(Math.min(4, zoomLevel + 0.5));
                }
              }}
              className="bg-black bg-opacity-50 text-white p-1 rounded hover:bg-opacity-70 transition-opacity text-sm"
              aria-label="Zoom in"
            >
              +
            </button>
            {isZoomed && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  resetZoom();
                }}
                className="bg-black bg-opacity-50 text-white p-1 rounded hover:bg-opacity-70 transition-opacity text-sm"
                aria-label="Reset zoom"
              >
                ↻
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {showThumbnails && images.length > 1 && (
        <div className="bg-black bg-opacity-80 p-2">
          <div className="flex space-x-2 overflow-x-auto">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => goToImage(index)}
                className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-colors ${
                  index === activeIndex
                    ? 'border-white'
                    : 'border-transparent hover:border-gray-400'
                }`}
              >
                <img
                  src={image}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      {enableSwipe && !isZoomed && images.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded z-10">
          Swipe or use arrow keys
        </div>
      )}
    </div>
  );
}

export default ImageGallery;
