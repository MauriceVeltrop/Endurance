Fixes Vercel prerender error: ReferenceError: preset is not defined.
Cause: styles object is module-scoped, but referenced component-local preset.
Changed ImageCropperModal stage height to a static safe value.
