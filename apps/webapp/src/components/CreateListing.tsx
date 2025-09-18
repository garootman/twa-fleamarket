import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Text } from './ui';
import { Category, Listing, User } from './ListingBrowse';

export interface CreateListingProps {
  token: string;
  currentUser: User;
  editingListing?: Listing;
  onSave?: (listing: Listing) => void;
  onCancel?: () => void;
}

interface CreateListingFormData {
  category_id: number | null;
  title: string;
  description: string;
  price_usd: string;
  images: File[];
}

interface PreviewData extends Omit<CreateListingFormData, 'images'> {
  images: string[];
}

// Mock API functions - these should be replaced with actual API calls
const fetchCategories = async (): Promise<Category[]> => {
  return [
    { id: 1, name: 'Electronics', parent_id: undefined, is_active: true },
    { id: 2, name: 'Phones', parent_id: 1, is_active: true },
    { id: 3, name: 'Laptops', parent_id: 1, is_active: true },
    { id: 4, name: 'Clothing', parent_id: undefined, is_active: true },
    { id: 5, name: 'Books', parent_id: undefined, is_active: true },
  ];
};

const uploadImages = async (images: File[], token: string): Promise<string[]> => {
  // TODO: Replace with actual API call to /api/upload
  await new Promise(resolve => setTimeout(resolve, 1000));
  return images.map((_, index) => `https://via.placeholder.com/400x300?text=Image+${index + 1}`);
};

const createListing = async (data: any, token: string): Promise<Listing> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    id: 'new-' + Date.now(),
    user_id: data.currentUser.telegram_id,
    category_id: data.category_id,
    title: data.title,
    description: data.description,
    price_usd: parseFloat(data.price_usd),
    images: data.images,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'draft',
    is_sticky: false,
    is_highlighted: false,
    view_count: 0,
    contact_username: data.currentUser.username || '',
    published_at: null,
    time_left: '7 days left',
    can_bump: false,
    user: data.currentUser,
    category: { id: data.category_id, name: 'Category', is_active: true },
  };
};

const updateListing = async (listingId: string, data: any, token: string): Promise<Listing> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500));
  return { ...data.editingListing, ...data };
};

export function CreateListing({
  token,
  currentUser,
  editingListing,
  onSave,
  onCancel,
}: CreateListingProps): JSX.Element {
  const [formData, setFormData] = useState<CreateListingFormData>({
    category_id: editingListing?.category_id || null,
    title: editingListing?.title || '',
    description: editingListing?.description || '',
    price_usd: editingListing?.price_usd?.toString() || '',
    images: [],
  });

  const [showPreview, setShowPreview] = useState(false);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>(
    editingListing?.images || []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const uploadMutation = useMutation({
    mutationFn: (images: File[]) => uploadImages(images, token),
    onSuccess: urls => {
      setUploadedImageUrls(prev => [...prev, ...urls]);
      setFormData(prev => ({ ...prev, images: [] }));
    },
    onError: error => {
      alert(`Failed to upload images: ${error.message}`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingListing) {
        return updateListing(editingListing.id, data, token);
      } else {
        return createListing(data, token);
      }
    },
    onSuccess: listing => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      onSave?.(listing);
    },
    onError: error => {
      alert(`Failed to save listing: ${error.message}`);
    },
  });

  const categories = categoriesQuery.data || [];
  const childCategories = categories.filter(cat => cat.parent_id);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must be 100 characters or less';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 1000) {
      newErrors.description = 'Description must be 1000 characters or less';
    }

    if (!formData.category_id) {
      newErrors.category_id = 'Category is required';
    }

    const price = parseFloat(formData.price_usd);
    if (!formData.price_usd || isNaN(price) || price <= 0) {
      newErrors.price_usd = 'Valid price is required';
    }

    if (uploadedImageUrls.length === 0 && formData.images.length === 0) {
      newErrors.images = 'At least one image is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof CreateListingFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + uploadedImageUrls.length > 9) {
      alert('Maximum 9 images allowed');
      return;
    }

    setFormData(prev => ({ ...prev, images: [...prev.images, ...files] }));
  };

  const handleImageUpload = () => {
    if (formData.images.length > 0) {
      uploadMutation.mutate(formData.images);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    if (!validateForm()) return;
    setShowPreview(true);
  };

  const handleSave = async (asDraft = true) => {
    if (!validateForm()) return;

    // Upload remaining images if any
    if (formData.images.length > 0) {
      await uploadMutation.mutateAsync(formData.images);
    }

    const saveData = {
      ...formData,
      price_usd: parseFloat(formData.price_usd),
      images: uploadedImageUrls,
      currentUser,
      editingListing,
      status: asDraft ? 'draft' : 'active',
    };

    saveMutation.mutate(saveData);
  };

  if (showPreview) {
    const previewData: PreviewData = {
      ...formData,
      images: uploadedImageUrls,
    };

    return (
      <div className="p-4 max-w-4xl mx-auto">
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <Text variant="title">Preview Listing</Text>
            <Button variant="secondary" onClick={() => setShowPreview(false)} size="sm">
              ← Edit
            </Button>
          </div>
        </Card>

        {/* Preview of the listing as it would appear */}
        <Card className="mb-4 p-0 overflow-hidden">
          <img
            src={previewData.images[0] || 'https://via.placeholder.com/400x200?text=No+Image'}
            alt={previewData.title}
            className="w-full h-64 object-cover"
          />
        </Card>

        <Card className="mb-4">
          <h1 className="text-2xl font-bold mb-2">{previewData.title}</h1>
          <div className="text-3xl font-bold text-green-600 mb-4">
            ${parseFloat(previewData.price_usd).toFixed(2)}
          </div>
          <p className="text-gray-700 whitespace-pre-line">{previewData.description}</p>
        </Card>

        <Card>
          <div className="space-y-3">
            <Button
              variant="primary"
              onClick={() => handleSave(false)}
              disabled={saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending ? 'Publishing...' : '🚀 Publish Listing'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSave(true)}
              disabled={saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending ? 'Saving...' : '💾 Save as Draft'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Text variant="title">{editingListing ? 'Edit Listing' : 'Create New Listing'}</Text>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} size="sm">
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <form onSubmit={e => e.preventDefault()}>
        {/* Category Selection */}
        <Card className="mb-4">
          <Text variant="subtitle" className="mb-3">
            Category
          </Text>
          <select
            value={formData.category_id || ''}
            onChange={e => handleInputChange('category_id', parseInt(e.target.value))}
            className="w-full p-2 border rounded-lg"
          >
            <option value="">Select a category</option>
            {childCategories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.category_id && (
            <Text className="text-red-600 text-sm mt-1">{errors.category_id}</Text>
          )}
        </Card>

        {/* Title */}
        <Card className="mb-4">
          <Text variant="subtitle" className="mb-3">
            Title
          </Text>
          <input
            type="text"
            value={formData.title}
            onChange={e => handleInputChange('title', e.target.value)}
            placeholder="Enter listing title"
            maxLength={100}
            className="w-full p-2 border rounded-lg"
          />
          <div className="flex justify-between mt-1">
            {errors.title ? <Text className="text-red-600 text-sm">{errors.title}</Text> : <div />}
            <Text className="text-gray-500 text-sm">{formData.title.length}/100</Text>
          </div>
        </Card>

        {/* Price */}
        <Card className="mb-4">
          <Text variant="subtitle" className="mb-3">
            Price (USD)
          </Text>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              type="number"
              value={formData.price_usd}
              onChange={e => handleInputChange('price_usd', e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full pl-8 pr-3 py-2 border rounded-lg"
            />
          </div>
          {errors.price_usd && (
            <Text className="text-red-600 text-sm mt-1">{errors.price_usd}</Text>
          )}
        </Card>

        {/* Description */}
        <Card className="mb-4">
          <Text variant="subtitle" className="mb-3">
            Description
          </Text>
          <textarea
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            placeholder="Describe your item in detail"
            maxLength={1000}
            rows={6}
            className="w-full p-2 border rounded-lg resize-vertical"
          />
          <div className="flex justify-between mt-1">
            {errors.description ? (
              <Text className="text-red-600 text-sm">{errors.description}</Text>
            ) : (
              <div />
            )}
            <Text className="text-gray-500 text-sm">{formData.description.length}/1000</Text>
          </div>
        </Card>

        {/* Images */}
        <Card className="mb-4">
          <Text variant="subtitle" className="mb-3">
            Images
          </Text>

          {/* Upload button */}
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="mr-2"
            >
              📷 Select Images
            </Button>
            {formData.images.length > 0 && (
              <Button
                type="button"
                variant="primary"
                onClick={handleImageUpload}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending
                  ? 'Uploading...'
                  : `Upload ${formData.images.length} Image(s)`}
              </Button>
            )}
          </div>

          {/* Selected files */}
          {formData.images.length > 0 && (
            <div className="mb-4">
              <Text className="text-sm text-gray-600 mb-2">Selected files:</Text>
              {formData.images.map((file, index) => (
                <div key={index} className="text-sm text-gray-700">
                  • {file.name}
                </div>
              ))}
            </div>
          )}

          {/* Uploaded images */}
          {uploadedImageUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {uploadedImageUrls.map((url, index) => (
                <div key={index} className="relative">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-20 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <Text className="text-gray-500 text-sm mt-2">
            Maximum 9 images. First image will be the main photo.
          </Text>
          {errors.images && <Text className="text-red-600 text-sm mt-1">{errors.images}</Text>}
        </Card>

        {/* Action Buttons */}
        <Card>
          <div className="space-y-3">
            <Button type="button" variant="primary" onClick={handlePreview} className="w-full">
              👁️ Preview Listing
            </Button>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={saveMutation.isPending}
                className="flex-1"
              >
                {saveMutation.isPending ? 'Saving...' : '💾 Save Draft'}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleSave(false)}
                disabled={saveMutation.isPending}
                className="flex-1"
              >
                {saveMutation.isPending ? 'Publishing...' : '🚀 Publish'}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}

export default CreateListing;
