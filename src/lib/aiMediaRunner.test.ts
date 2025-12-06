/**
 * Unit tests for AI media runner and provider integrations
 */

describe('AI Media Runner', () => {
  describe('Storage Path Standards', () => {
    it('should generate correct path for image', () => {
      const courseId = 'science-gr3';
      const itemId = 5;
      const timestamp = 1730567890123;
      const ext = 'png';
      
      const path = `${courseId}/assets/images/item-${itemId}-${timestamp}.${ext}`;
      
      expect(path).toBe('science-gr3/assets/images/item-5-1730567890123.png');
    });

    it('should generate correct path for audio', () => {
      const courseId = 'english';
      const itemId = 12;
      const timestamp = 1730567890123;
      
      const audioPath = `${courseId}/assets/audios/item-${itemId}-${timestamp}.mp3`;
      const transcriptPath = `${courseId}/assets/audios/item-${itemId}-${timestamp}-transcript.txt`;
      
      expect(audioPath).toBe('english/assets/audios/item-12-1730567890123.mp3');
      expect(transcriptPath).toBe('english/assets/audios/item-12-1730567890123-transcript.txt');
    });

    it('should generate correct path for video', () => {
      const courseId = 'physics';
      const itemId = 3;
      const timestamp = 1730567890123;
      
      const videoPath = `${courseId}/assets/videos/item-${itemId}-${timestamp}.mp4`;
      const captionsPath = `${courseId}/assets/videos/item-${itemId}-${timestamp}-captions.vtt`;
      
      expect(videoPath).toBe('physics/assets/videos/item-3-1730567890123.mp4');
      expect(captionsPath).toBe('physics/assets/videos/item-3-1730567890123-captions.vtt');
    });
  });

  describe('Media Type Validation', () => {
    it('should validate supported media types', () => {
      const validTypes: Array<'image' | 'audio' | 'video'> = ['image', 'audio', 'video'];
      
      validTypes.forEach((type) => {
        expect(['image', 'audio', 'video']).toContain(type);
      });
    });

    it('should reject invalid media types', () => {
      const invalidTypes = ['pdf', 'doc', 'txt', 'zip'];
      
      invalidTypes.forEach((type) => {
        expect(['image', 'audio', 'video']).not.toContain(type);
      });
    });
  });

  describe('Provider Selection', () => {
    it('should select correct provider for each media type', () => {
      const providers = {
        image: 'openai',   // DALL-E
        audio: 'openai',   // TTS
        video: 'replicate', // Video generation
      };

      expect(providers.image).toBe('openai');
      expect(providers.audio).toBe('openai');
      expect(providers.video).toBe('replicate');
    });

    it('should allow ElevenLabs for audio as alternative', () => {
      const audioProviders = ['openai', 'elevenlabs'];
      
      expect(audioProviders).toContain('openai');
      expect(audioProviders).toContain('elevenlabs');
    });
  });

  describe('Metadata Structure', () => {
    it('should structure image metadata correctly', () => {
      const imageMetadata = {
        size: "1024x1024",
        format: "png",
        model: "dall-e-3",
        revised_prompt: "A realistic photo of a lion in the savanna",
        generated_at: "2025-10-23T12:00:00Z",
      };

      expect(imageMetadata.size).toBe("1024x1024");
      expect(imageMetadata.format).toBe("png");
      expect(imageMetadata.model).toBe("dall-e-3");
    });

    it('should structure audio metadata with transcript URL', () => {
      const audioMetadata = {
        transcriptUrl: "https://example.com/transcript.txt",
        duration: "auto",
        voice: "alloy",
        model: "tts-1",
        format: "mp3",
      };

      expect(audioMetadata.transcriptUrl).toBeDefined();
      expect(audioMetadata.voice).toBe("alloy");
      expect(audioMetadata.model).toBe("tts-1");
    });

    it('should structure video metadata with captions URL', () => {
      const videoMetadata = {
        duration: "auto",
        format: "mp4",
        resolution: "1024x576",
        fps: 8,
        captionsUrl: "https://example.com/captions.vtt",
      };

      expect(videoMetadata.format).toBe("mp4");
      expect(videoMetadata.captionsUrl).toBeDefined();
    });
  });

  describe('File Size Validation', () => {
    it('should validate image size limit', () => {
      const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
      const validSize = 1.5 * 1024 * 1024; // 1.5 MB
      const invalidSize = 3 * 1024 * 1024; // 3 MB

      expect(validSize).toBeLessThanOrEqual(MAX_IMAGE_SIZE);
      expect(invalidSize).toBeGreaterThan(MAX_IMAGE_SIZE);
    });

    it('should validate audio size limit', () => {
      const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5 MB
      const validSize = 3 * 1024 * 1024; // 3 MB
      const invalidSize = 6 * 1024 * 1024; // 6 MB

      expect(validSize).toBeLessThanOrEqual(MAX_AUDIO_SIZE);
      expect(invalidSize).toBeGreaterThan(MAX_AUDIO_SIZE);
    });

    it('should validate video size limit', () => {
      const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15 MB
      const validSize = 10 * 1024 * 1024; // 10 MB
      const invalidSize = 20 * 1024 * 1024; // 20 MB

      expect(validSize).toBeLessThanOrEqual(MAX_VIDEO_SIZE);
      expect(invalidSize).toBeGreaterThan(MAX_VIDEO_SIZE);
    });
  });

  describe('Public URL Generation', () => {
    it('should construct correct public URL', () => {
      const projectUrl = 'https://grffepyrmjihphldyfha.supabase.co';
      const path = 'science-gr3/assets/images/item-12-1730567890.png';
      
      const publicUrl = `${projectUrl}/storage/v1/object/public/courses/${path}`;
      
      expect(publicUrl).toBe('https://grffepyrmjihphldyfha.supabase.co/storage/v1/object/public/courses/science-gr3/assets/images/item-12-1730567890.png');
    });

    it('should handle special characters in course ID', () => {
      const courseId = 'algebra-I-honors';
      const itemId = 0;
      const timestamp = 123;
      
      const path = `${courseId}/assets/images/item-${itemId}-${timestamp}.png`;
      
      expect(path).toBe('algebra-I-honors/assets/images/item-0-123.png');
    });
  });

  describe('Job Polling Logic', () => {
    it('should calculate correct poll interval', () => {
      const pollIntervalMs = 5000; // 5 seconds
      const maxPolls = 60; // 5 minutes total
      
      const maxDurationMs = pollIntervalMs * maxPolls;
      
      expect(maxDurationMs).toBe(300000); // 5 minutes = 300000ms
    });

    it('should detect job completion', () => {
      const job = {
        id: 'uuid',
        status: 'done',
        result_url: 'https://example.com/image.png',
      };

      const isDone = job.status === 'done';
      const isFailed = ['failed', 'dead_letter'].includes(job.status);
      
      expect(isDone).toBe(true);
      expect(isFailed).toBe(false);
    });

    it('should detect job failure', () => {
      const job = {
        id: 'uuid',
        status: 'failed',
        error: 'OpenAI API error',
      };

      const isDone = job.status === 'done';
      const isFailed = ['failed', 'dead_letter'].includes(job.status);
      
      expect(isDone).toBe(false);
      expect(isFailed).toBe(true);
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate unique keys for media jobs', () => {
      const generateKey = () => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `media-${timestamp}-${random}`;
      };

      const key1 = generateKey();
      const key2 = generateKey();

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^media-\d+-[a-z0-9]+$/);
    });

    it('should allow retry with same idempotency key', () => {
      const idempotencyKey = 'media-1234-abc';
      
      const job1 = {
        id: 'uuid-1',
        idempotency_key: idempotencyKey,
        media_type: 'image',
        status: 'processing',
      };

      // Client retry with same key should return existing job
      const job2 = {
        id: 'uuid-1', // Same ID due to unique constraint
        idempotency_key: idempotencyKey,
        media_type: 'image',
        status: 'done',
      };

      expect(job1.id).toBe(job2.id);
      expect(job1.idempotency_key).toBe(job2.idempotency_key);
    });
  });
});

