// Shared media-related types

export type FitMode = 'cover' | 'contain';
export type MediaLayout = 'thumbnail' | 'full';

export type ImageMedia = {
  type: 'image';
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  fitMode?: FitMode;
  mediaLayout?: MediaLayout;
};

export type VideoMedia = {
  type: 'video';
  url: string;
  captionsUrl?: string;
  fitMode?: FitMode;
  mediaLayout?: MediaLayout;
};

export type AudioMedia = {
  type: 'audio';
  url: string;
  transcriptUrl?: string;
};

export type OptionMedia = ImageMedia | VideoMedia | AudioMedia | null;
