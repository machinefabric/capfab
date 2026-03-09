#!/usr/bin/env node

// Auto-generated script to upload standard capabilities to CAPDAG registry
// NOTE: This only uploads public capabilities, not machfab-specific ones

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
const DEST_PATH = process.env.CAPDAG_DEST_PATH;

const capabilities = [
  {
    "name": "audio-transcription-candle",
    "capability": {
      "urn": "cap:candle;in=\"media:audio;wav;speech\";ml-model;op=transcribe;out=\"media:transcription;textable;record\"",
      "command": "transcribe",
      "title": "Transcribe Audio (Candle)",
      "cap_description": "Transcribe audio files to text using Whisper models with Candle ML framework",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:audio;wav;speech"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the audio file (WAV format)"
        },
        {
          "media_urn": "media:language;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Language code for transcription",
          "default_value": "en"
        },
        {
          "media_urn": "media:timestamps;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--timestamps"
            }
          ],
          "arg_description": "Include timestamps in output",
          "default_value": false
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "Whisper model name from HuggingFace",
          "default_value": "hf:openai/whisper-base"
        }
      ],
      "output": {
        "media_urn": "media:transcription;textable;record",
        "output_description": "Transcribed text with optional timestamps and metadata"
      }
    }
  },
  {
    "name": "choose-bit-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=choose_bit;out=\"media:decision;bool;textable\"",
      "command": "bit_choice",
      "title": "Make a Choice",
      "cap_description": "Make a single binary (yes/no, true/false) decision based on content and a question",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Content to analyze for the binary decision"
        },
        {
          "media_urn": "media:question;textable",
          "required": true,
          "sources": [
            {
              "cli_flag": "--question"
            }
          ],
          "arg_description": "The binary question to answer about the content"
        },
        {
          "media_urn": "media:language-code;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Language code for processing",
          "default_value": "en"
        },
        {
          "media_urn": "media:max-content-length;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-content-length"
            }
          ],
          "arg_description": "Maximum content length to consider (for context window management)",
          "default_value": 2048
        },
        {
          "media_urn": "media:confidence-threshold;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--confidence-threshold"
            }
          ],
          "arg_description": "Minimum confidence threshold for decisions",
          "default_value": 0.7
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for decision making",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:decision;bool;textable",
        "output_description": "Binary decision result (true/false)"
      }
    }
  },
  {
    "name": "choose-bits-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=choose_bits;out=\"media:decision;bool;textable;list\"",
      "command": "bit_choices",
      "title": "Make Multiple Choices",
      "cap_description": "Make multiple binary (yes/no, true/false) decisions based on content and multiple questions",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Content to analyze for the binary decisions"
        },
        {
          "media_urn": "media:question;textable;list",
          "required": true,
          "sources": [
            {
              "cli_flag": "--questions"
            }
          ],
          "arg_description": "Array of binary questions to answer about the content"
        },
        {
          "media_urn": "media:language-code;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Language code for processing",
          "default_value": "en"
        },
        {
          "media_urn": "media:max-content-length;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-content-length"
            }
          ],
          "arg_description": "Maximum content length to consider (for context window management)",
          "default_value": 2048
        },
        {
          "media_urn": "media:confidence-threshold;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--confidence-threshold"
            }
          ],
          "arg_description": "Minimum confidence threshold for decisions",
          "default_value": 0.7
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for decision making",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:decision;bool;textable;list",
        "output_description": "Array of boolean decision results corresponding to each question"
      }
    }
  },
  {
    "name": "disbind-pdf",
    "capability": {
      "urn": "cap:in=media:pdf;op=disbind;out=\"media:disbound-page;textable;list\"",
      "command": "disbind",
      "title": "Disbind PDF Into Pages",
      "cap_description": "Extract structured page content from PDF document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:pdf"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the document file to process"
        },
        {
          "media_urn": "media:index-range;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--index-range"
            }
          ],
          "arg_description": "Index Range to extract (e.g., '1-5' or '10-')"
        }
      ],
      "output": {
        "media_urn": "media:disbound-page;textable;list",
        "output_description": "Array of disbound page objects with text content"
      }
    }
  },
  {
    "name": "disbind-rst",
    "capability": {
      "urn": "cap:in=\"media:rst;textable\";op=disbind;out=\"media:disbound-page;textable;list\"",
      "command": "disbind",
      "title": "Disbind RST Into Pages",
      "cap_description": "Disbind RST file into text content from its pages",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:rst;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the RST file to process"
        },
        {
          "media_urn": "media:index-range;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--index-range"
            }
          ],
          "arg_description": "Index Range to extract (e.g., '1-5' or '10-')"
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured file chips with text content"
      }
    }
  },
  {
    "name": "embeddings-dimensions-candle",
    "capability": {
      "urn": "cap:candle;in=\"media:model-spec;textable\";ml-model;op=embeddings_dimensions;out=\"media:model-dim;integer;textable;numeric\"",
      "command": "get_embedding_dimensions",
      "title": "Get Embeddings Dimensions (Candle)",
      "cap_description": "Query the dimensionality of embeddings for a given Candle model",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "HuggingFace model name to query dimensions for",
          "default_value": "hf:sentence-transformers/all-MiniLM-L6-v2"
        }
      ],
      "output": {
        "media_urn": "media:model-dim;integer;textable;numeric",
        "output_description": "Dimensionality of the embeddings (positive integer)"
      }
    }
  },
  {
    "name": "embeddings-dimensions-gguf",
    "capability": {
      "urn": "cap:gguf;in=\"media:model-spec;textable\";ml-model;op=embeddings_dimensions;out=\"media:model-dim;integer;textable;numeric\"",
      "command": "get_embedding_dimensions",
      "title": "Get Embeddings Dimensions (GGUF)",
      "cap_description": "Query the dimensionality of embeddings for a given GGUF model",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "GGUF model specification to query dimensions for",
          "default_value": "hf:nomic-ai/nomic-embed-text-v1.5-GGUF"
        }
      ],
      "output": {
        "media_urn": "media:model-dim;integer;textable;numeric",
        "output_description": "Dimensionality of the embeddings (n_embd from model metadata)"
      }
    }
  },
  {
    "name": "embeddings-dimensions-mlx",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";ml-model;mlx;op=embeddings_dimensions;out=\"media:model-dim;integer;textable;numeric\"",
      "command": "get_embedding_dimensions",
      "title": "Get Embeddings Dimensions (MLX)",
      "cap_description": "Query the dimensionality of embeddings for a given MLX model",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "position": 0
            }
          ],
          "arg_description": "Path to MLX embedding model directory",
          "default_value": "hf:mlx-community/all-MiniLM-L6-v2-4bit"
        }
      ],
      "output": {
        "media_urn": "media:model-dim;integer;textable;numeric",
        "output_description": "Dimensionality of the embeddings (positive integer)"
      }
    }
  },
  {
    "name": "embeddings-dimensions",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=embeddings_dimensions;out=\"media:model-dim;integer;textable;numeric\"",
      "command": "get_embedding_dimensions",
      "title": "Get Embeddings Dimensions",
      "cap_description": "Query the dimensionality of embeddings for a given model",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for retrieving embeddings dimensions",
          "default_value": "hf:sentence-transformers/all-MiniLM-L6-v2"
        }
      ],
      "output": {
        "media_urn": "media:model-dim;integer;textable;numeric",
        "output_description": "Dimensionality of the embeddings (positive integer)"
      }
    }
  },
  {
    "name": "embeddings-generation-candle",
    "capability": {
      "urn": "cap:candle;in=media:textable;ml-model;op=generate_embeddings;out=\"media:embedding-vector;textable;record\"",
      "command": "generate_embeddings",
      "title": "Generate Vector Embeddings (Candle)",
      "cap_description": "Generate vector embeddings from text using Candle ML framework on CPU/GPU",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to text file to generate embeddings from"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "HuggingFace model name for embeddings",
          "default_value": "hf:sentence-transformers/all-MiniLM-L6-v2"
        },
        {
          "media_urn": "media:chunk-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-size"
            }
          ],
          "arg_description": "Chunk size in words for splitting input text",
          "default_value": 400
        },
        {
          "media_urn": "media:chunk-overlap;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-overlap"
            }
          ],
          "arg_description": "Chunk overlap in words when splitting input text",
          "default_value": 50
        }
      ],
      "output": {
        "media_urn": "media:embedding-vector;textable;record",
        "output_description": "JSON containing embeddings, chunk metadata and model information"
      }
    }
  },
  {
    "name": "embeddings-generation-gguf",
    "capability": {
      "urn": "cap:gguf;in=media:textable;ml-model;op=generate_embeddings;out=\"media:embedding-vector;textable;record\"",
      "command": "generate_embeddings",
      "title": "Generate Vector Embeddings (GGUF)",
      "cap_description": "Generate vector embeddings from text using GGUF models with llama.cpp backend",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "GGUF model specification (HuggingFace repo or local path)",
          "default_value": "hf:nomic-ai/nomic-embed-text-v1.5-GGUF"
        },
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to text file to generate embeddings from"
        },
        {
          "media_urn": "media:chunk-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-size"
            }
          ],
          "arg_description": "Chunk size in words for splitting input text",
          "default_value": 400
        },
        {
          "media_urn": "media:chunk-overlap;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-overlap"
            }
          ],
          "arg_description": "Chunk overlap in words when splitting input text",
          "default_value": 50
        },
        {
          "media_urn": "media:batch-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--batch-size"
            }
          ],
          "arg_description": "Token batch size for model inference (must accommodate tokenized chunk)",
          "default_value": 2048
        }
      ],
      "output": {
        "media_urn": "media:embedding-vector;textable;record",
        "output_description": "JSON containing L2-normalized embeddings, chunk metadata and model information"
      }
    }
  },
  {
    "name": "embeddings-generation-image",
    "capability": {
      "urn": "cap:candle;in=\"media:image;png\";ml-model;op=generate_image_embeddings;out=\"media:embedding-vector;textable;record\"",
      "command": "generate_image_embeddings",
      "title": "Generate Image Embeddings (Candle)",
      "cap_description": "Generate image embeddings using CLIP models with Candle ML framework",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:image;png"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the image file to embed"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "CLIP model name from HuggingFace",
          "default_value": "hf:openai/clip-vit-base-patch32"
        }
      ],
      "output": {
        "media_urn": "media:embedding-vector;textable;record",
        "output_description": "Image embedding vector with model metadata"
      }
    }
  },
  {
    "name": "embeddings-generation-mlx",
    "capability": {
      "urn": "cap:in=media:textable;ml-model;mlx;op=generate_embeddings;out=\"media:embedding-vector;textable;record\"",
      "command": "generate_embeddings",
      "title": "Generate Vector Embeddings (MLX)",
      "cap_description": "Generate vector embeddings from text using MLX-based models on Apple Silicon",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "Path to MLX embedding model directory",
          "default_value": "hf:mlx-community/all-MiniLM-L6-v2-4bit"
        },
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to text file to generate embeddings from"
        },
        {
          "media_urn": "media:chunk-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-size"
            }
          ],
          "arg_description": "Chunk size in words for splitting input text",
          "default_value": 400
        },
        {
          "media_urn": "media:chunk-overlap;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-overlap"
            }
          ],
          "arg_description": "Chunk overlap in words when splitting input text",
          "default_value": 50
        }
      ],
      "output": {
        "media_urn": "media:embedding-vector;textable;record",
        "output_description": "JSON containing embeddings, chunk metadata and model information"
      }
    }
  },
  {
    "name": "embeddings-generation-text",
    "capability": {
      "urn": "cap:in=media:textable;op=generate_embeddings;out=\"media:embedding-vector;textable;record\"",
      "command": "generate_embeddings",
      "title": "Generate Vector Embeddings for Text",
      "cap_description": "Generate vector embeddings from text or file input",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to text file to generate embeddings from"
        },
        {
          "media_urn": "media:chunk-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-size"
            }
          ],
          "arg_description": "Chunk size in words for splitting input text",
          "default_value": 400
        },
        {
          "media_urn": "media:chunk-overlap;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--chunk-overlap"
            }
          ],
          "arg_description": "Chunk overlap in words when splitting input text",
          "default_value": 50
        },
        {
          "media_urn": "media:include-pattern;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include"
            }
          ],
          "arg_description": "File include pattern (can be provided multiple times)"
        },
        {
          "media_urn": "media:exclude-pattern;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--exclude"
            }
          ],
          "arg_description": "File exclude pattern (can be provided multiple times)"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for embeddings generation",
          "default_value": "hf:sentence-transformers/all-MiniLM-L6-v2"
        }
      ],
      "output": {
        "media_urn": "media:embedding-vector;textable;record",
        "output_description": "JSON file containing embeddings, chunk metadata and model information"
      }
    }
  },
  {
    "name": "extract-metadata-log",
    "capability": {
      "urn": "cap:in=\"media:log;textable\";op=extract_metadata;out=\"media:file-metadata;textable;record\"",
      "command": "extract-metadata",
      "title": "Extract Log Metadata",
      "cap_description": "Extract log document metadata including title, file size, word count, and other properties",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:log;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the log file to process"
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured metadata including file properties and log-specific metadata"
      }
    }
  },
  {
    "name": "extract-metadata-md",
    "capability": {
      "urn": "cap:in=\"media:md;textable\";op=extract_metadata;out=\"media:file-metadata;textable;record\"",
      "command": "extract-metadata",
      "title": "Extract Markdown Metadata",
      "cap_description": "Extract markdown document metadata including title, file size, word count, and other properties",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:md;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the markdown file to process"
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured metadata including file properties and markdown-specific metadata"
      }
    }
  },
  {
    "name": "extract-metadata-pdf",
    "capability": {
      "urn": "cap:in=media:pdf;op=extract_metadata;out=\"media:file-metadata;textable;record\"",
      "command": "extract-metadata",
      "title": "Extract PDF Metadata",
      "cap_description": "Extract PDF document metadata including title, author, creation date, file size, and other properties",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:pdf"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the document file to process"
        }
      ],
      "output": {
        "media_urn": "media:file-metadata;textable;record",
        "output_description": "Structured metadata including file properties, document properties, and format-specific metadata"
      }
    }
  },
  {
    "name": "extract-metadata-rst",
    "capability": {
      "urn": "cap:in=\"media:rst;textable\";op=extract_metadata;out=\"media:file-metadata;textable;record\"",
      "command": "extract-metadata",
      "title": "Extract RST Metadata",
      "cap_description": "Extract RST document metadata including title, file size, word count, and other properties",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:rst;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the RST file to process"
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured metadata including file properties and RST-specific metadata"
      }
    }
  },
  {
    "name": "extract-metadata-txt",
    "capability": {
      "urn": "cap:in=\"media:txt;textable\";op=extract_metadata;out=\"media:file-metadata;textable;record\"",
      "command": "extract-metadata",
      "title": "Extract Text Metadata",
      "cap_description": "Extract text document metadata including title, file size, word count, and other properties",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:txt;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the text file to process"
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured metadata including file properties and text-specific metadata"
      }
    }
  },
  {
    "name": "extract-outline-md",
    "capability": {
      "urn": "cap:in=\"media:md;textable\";op=extract_outline;out=\"media:document-outline;textable;record\"",
      "command": "extract-outline",
      "title": "Extract Markdown Outline",
      "cap_description": "Extract document outline/table of contents from markdown files",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:md;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the markdown file to process"
        },
        {
          "media_urn": "media:max-depth;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-depth"
            }
          ],
          "arg_description": "Maximum outline depth to extract (1-10)"
        },
        {
          "media_urn": "media:include-order-indexes;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include-order-indexes"
            }
          ],
          "arg_description": "Include page numbers in the outline",
          "default_value": true
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured document outline with hierarchical entries"
      }
    }
  },
  {
    "name": "extract-outline-pdf",
    "capability": {
      "urn": "cap:in=media:pdf;op=extract_outline;out=\"media:document-outline;textable;record\"",
      "command": "extract-outline",
      "title": "Extract PDF Outline",
      "cap_description": "Extract PDF document outline/table of contents with hierarchical structure",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:pdf"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the document file to process"
        },
        {
          "media_urn": "media:max-depth;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-depth"
            }
          ],
          "arg_description": "Maximum outline depth to extract (1-10)"
        },
        {
          "media_urn": "media:include-order-indexes;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include-order-indexes"
            }
          ],
          "arg_description": "Include page numbers in the outline (default: true)",
          "default_value": true
        }
      ],
      "output": {
        "media_urn": "media:document-outline;textable;record",
        "output_description": "Hierarchical document outline with section titles and optional page numbers"
      }
    }
  },
  {
    "name": "extract-outline-rst",
    "capability": {
      "urn": "cap:in=\"media:rst;textable\";op=extract_outline;out=\"media:document-outline;textable;record\"",
      "command": "extract-outline",
      "title": "Extract RST Outline",
      "cap_description": "Extract document outline/table of contents from RST files",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:rst;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the RST file to process"
        },
        {
          "media_urn": "media:max-depth;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-depth"
            }
          ],
          "arg_description": "Maximum outline depth to extract (1-10)"
        },
        {
          "media_urn": "media:include-order-indexes;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include-order-indexes"
            }
          ],
          "arg_description": "Include page numbers in the outline",
          "default_value": true
        }
      ],
      "output": {
        "media_urn": "media:textable;record",
        "output_description": "Structured document outline with hierarchical entries"
      }
    }
  },
  {
    "name": "generate-frontmatter-summary",
    "capability": {
      "urn": "cap:constrained;in=\"media:frontmatter;textable\";language=en;op=generate_frontmatter_summary;out=media:textable",
      "command": "generate_text",
      "title": "Summarize Frontmatter",
      "cap_description": "Extract and organize bibliographic information from book frontmatter text",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:frontmatter;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:frontmatter;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Frontmatter text to process and summarize"
        },
        {
          "media_urn": "media:output-format;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--format"
            }
          ],
          "arg_description": "Output format for the summary",
          "default_value": "organized"
        },
        {
          "media_urn": "media:preserve-all-data;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--preserve-all-data"
            }
          ],
          "arg_description": "Whether to preserve all factual information",
          "default_value": true
        },
        {
          "media_urn": "media:remove-boilerplate;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--remove-boilerplate"
            }
          ],
          "arg_description": "Whether to remove legal boilerplate and formatting chips",
          "default_value": true
        },
        {
          "media_urn": "media:language;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Language of the frontmatter text",
          "default_value": "en"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens for summary output",
          "default_value": 2000
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for summary generation",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:textable",
        "output_description": "Organized bibliographic summary with extracted metadata"
      }
    }
  },
  {
    "name": "generate-thumbnail-log",
    "capability": {
      "urn": "cap:in=\"media:log;textable\";op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate Log Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the log document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:log;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the log file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the log document"
      }
    }
  },
  {
    "name": "generate-thumbnail-md",
    "capability": {
      "urn": "cap:in=\"media:md;textable\";op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate Markdown Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the markdown document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:md;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the markdown file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the markdown document"
      }
    }
  },
  {
    "name": "generate-thumbnail-pdf",
    "capability": {
      "urn": "cap:in=media:pdf;op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate PDF Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:pdf"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the document file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        },
        {
          "media_urn": "media:index-range;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--index-range"
            }
          ],
          "arg_description": "Index Range to generate thumbnails from (1-based). Examples: '1' (single page), '1-5' (pages 1-5), '3-' (page 3 to end)",
          "default_value": "1"
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the document"
      }
    }
  },
  {
    "name": "generate-thumbnail-rst",
    "capability": {
      "urn": "cap:in=\"media:rst;textable\";op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate RST Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the RST document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:rst;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the RST file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the RST document"
      }
    }
  },
  {
    "name": "generate-thumbnail-txt",
    "capability": {
      "urn": "cap:in=\"media:txt;textable\";op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate Text Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the text document",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:txt;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the text file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the text document"
      }
    }
  },
  {
    "name": "generate-thumbnail",
    "capability": {
      "urn": "cap:in=media:;op=generate_thumbnail;out=\"media:image;png;thumbnail\"",
      "command": "generate-thumbnail",
      "title": "Generate Thumbnail",
      "cap_description": "Generate a thumbnail image preview of the file",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the document file to process"
        },
        {
          "media_urn": "media:thumbnail-width;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--width"
            }
          ],
          "arg_description": "Width of the thumbnail in pixels",
          "default_value": 200
        },
        {
          "media_urn": "media:thumbnail-height;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--height"
            }
          ],
          "arg_description": "Height of the thumbnail in pixels",
          "default_value": 300
        },
        {
          "media_urn": "media:index-range;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--index-range"
            }
          ],
          "arg_description": "Index Range to generate thumbnails from (1-based).",
          "default_value": "1"
        }
      ],
      "output": {
        "media_urn": "media:image;png;thumbnail",
        "output_description": "PNG image data representing a thumbnail of the document"
      }
    }
  },
  {
    "name": "inference-codegeneration-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=codegeneration;out=\"media:generated-text;textable;record\"",
      "command": "llm_inference",
      "title": "Generate Code in English",
      "cap_description": "Code generation and programming tasks in English",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Code generation prompt or specification"
        },
        {
          "media_urn": "media:programming-language;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Programming language for code generation",
          "default_value": "rust"
        },
        {
          "media_urn": "media:code-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Existing code context or codebase information"
        },
        {
          "media_urn": "media:coding-style;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--style"
            }
          ],
          "arg_description": "Coding style or framework preferences"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens for generated code",
          "default_value": 4096
        },
        {
          "media_urn": "media:include-tests-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include-tests"
            }
          ],
          "arg_description": "Whether to include unit tests",
          "default_value": false
        },
        {
          "media_urn": "media:include-comments-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--include-comments"
            }
          ],
          "arg_description": "Whether to include code comments",
          "default_value": true
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for code generation",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Generated code with optional tests and documentation"
      }
    }
  },
  {
    "name": "inference-conversation-en",
    "capability": {
      "urn": "cap:in=media:textable;language=en;op=conversation;out=\"media:generated-text;textable;record\";unconstrained",
      "command": "llm_inference",
      "title": "Converse in English",
      "cap_description": "Natural conversation and chat responses in English",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "User's conversational input"
        },
        {
          "media_urn": "media:conversation-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Conversation context and history"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens to generate",
          "default_value": 2000
        },
        {
          "media_urn": "media:temperature;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--temperature"
            }
          ],
          "arg_description": "Sampling temperature for creativity vs consistency",
          "default_value": 0.7
        },
        {
          "media_urn": "media:system-prompt;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--system-prompt"
            }
          ],
          "arg_description": "System instructions for conversation behavior"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for conversation",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Generated conversational response with context information"
      }
    }
  },
  {
    "name": "inference-conversation-es",
    "capability": {
      "urn": "cap:in=media:textable;language=es;op=conversation;out=\"media:generated-text;textable;record\";unconstrained",
      "command": "llm_inference",
      "title": "Converse in Spanish",
      "cap_description": "Conversacion natural y respuestas de chat en espanol",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Entrada conversacional del usuario"
        },
        {
          "media_urn": "media:conversation-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Contexto e historial de conversacion"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximo de tokens a generar",
          "default_value": 2000
        },
        {
          "media_urn": "media:temperature;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--temperature"
            }
          ],
          "arg_description": "Temperatura de muestreo para creatividad vs consistencia",
          "default_value": 0.7
        },
        {
          "media_urn": "media:system-prompt;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--system-prompt"
            }
          ],
          "arg_description": "Instrucciones del sistema para comportamiento conversacional"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec a usar para la conversacion",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Respuesta conversacional generada con informacion de contexto"
      }
    }
  },
  {
    "name": "inference-creative-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=creative;out=\"media:generated-text;textable;record\"",
      "command": "llm_inference",
      "title": "Write Creatively in English",
      "cap_description": "Creative writing and content generation in English",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Creative writing prompt or brief"
        },
        {
          "media_urn": "media:genre;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--genre"
            }
          ],
          "arg_description": "Genre or style of creative content",
          "default_value": "fiction"
        },
        {
          "media_urn": "media:tone;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--tone"
            }
          ],
          "arg_description": "Tone or mood for the creative content",
          "default_value": "conversational"
        },
        {
          "media_urn": "media:output-length;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--length"
            }
          ],
          "arg_description": "Desired length of creative output",
          "default_value": "medium"
        },
        {
          "media_urn": "media:creative-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Background context or inspiration"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens for creative output",
          "default_value": 3000
        },
        {
          "media_urn": "media:creativity-level;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--creativity-level"
            }
          ],
          "arg_description": "Creativity level (0.0-1.0, higher = more creative)",
          "default_value": 0.8
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for creative writing",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Creative written content with metadata"
      }
    }
  },
  {
    "name": "inference-multiplechoice-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=multiplechoice;out=\"media:generated-text;textable;record\"",
      "command": "llm_inference",
      "title": "Answer Multiple Choice in English",
      "cap_description": "Logical reasoning and binary decision tasks in English",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Logical query or decision problem"
        },
        {
          "media_urn": "media:reasoning-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Context and facts for logical reasoning"
        },
        {
          "media_urn": "media:decision-type;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--decision-type"
            }
          ],
          "arg_description": "Type of logical decision required",
          "default_value": "binary"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens for reasoning output",
          "default_value": 1000
        },
        {
          "media_urn": "media:require-explanation-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--require-explanation"
            }
          ],
          "arg_description": "Whether to include reasoning explanation",
          "default_value": true
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for decision making",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Logical decision with reasoning explanation and confidence"
      }
    }
  },
  {
    "name": "inference-summarization-en",
    "capability": {
      "urn": "cap:constrained;in=media:textable;language=en;op=summarization;out=\"media:generated-text;textable;record\"",
      "command": "llm_inference",
      "title": "Summarize in English",
      "cap_description": "Document and text summarization in English",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Text content to summarize"
        },
        {
          "media_urn": "media:summary-type;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--summary-type"
            }
          ],
          "arg_description": "Type of summary to generate",
          "default_value": "abstractive"
        },
        {
          "media_urn": "media:output-length;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--length"
            }
          ],
          "arg_description": "Desired summary length",
          "default_value": "medium"
        },
        {
          "media_urn": "media:summary-focus;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--focus"
            }
          ],
          "arg_description": "Summary focus area",
          "default_value": "main_points"
        },
        {
          "media_urn": "media:summary-contextable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--context"
            }
          ],
          "arg_description": "Additional context for summarization"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum tokens for summary output",
          "default_value": 1000
        },
        {
          "media_urn": "media:preserve-structure-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--preserve-structure"
            }
          ],
          "arg_description": "Whether to preserve document structure",
          "default_value": false
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for summarization",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Summary with metadata including compression metrics"
      }
    }
  },
  {
    "name": "llm-inference-constrained-gguf",
    "capability": {
      "urn": "cap:constrained;gguf;in=\"media:llm-generation-request;json;record\";llm;ml-model;op=llm_inference_constrained;out=\"media:llm-text-stream;ndjson;streaming\"",
      "command": "inference",
      "title": "Constrained LLM Generation (GGUF)",
      "cap_description": "Generate text with LLGuidance constraints (JSON schema, regex, grammar). Output is NDJSON streaming.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:llm-generation-request;json;record",
          "required": true,
          "sources": [
            {
              "stdin": "media:llm-generation-request;json;record"
            }
          ],
          "arg_description": "The generation request with constraint field (json_schema, regex, or grammar)"
        }
      ],
      "output": {
        "media_urn": "media:llm-text-stream;ndjson;streaming",
        "output_description": "NDJSON stream of constrained tokens and completion"
      }
    }
  },
  {
    "name": "llm-inference-gguf",
    "capability": {
      "urn": "cap:gguf;in=\"media:llm-generation-request;json;record\";llm;ml-model;op=llm_inference;out=\"media:llm-text-stream;ndjson;streaming\"",
      "command": "inference",
      "title": "LLM Text Generation (GGUF)",
      "cap_description": "Generate text using GGUF models with llama.cpp backend. Output is NDJSON streaming tokens.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:llm-generation-request;json;record",
          "required": true,
          "sources": [
            {
              "stdin": "media:llm-generation-request;json;record"
            }
          ],
          "arg_description": "The generation request containing prompt, model spec, and parameters"
        }
      ],
      "output": {
        "media_urn": "media:llm-text-stream;ndjson;streaming",
        "output_description": "NDJSON stream of tokens, status updates, and completion message"
      }
    }
  },
  {
    "name": "llm-model-info-gguf",
    "capability": {
      "urn": "cap:gguf;in=\"media:llm-generation-request;json;record\";llm;ml-model;op=llm_model_info;out=\"media:llm-model-info;json;record\"",
      "command": "inference",
      "title": "Get Model Info (GGUF)",
      "cap_description": "Query metadata and capabilities of a GGUF model",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:llm-generation-request;json;record",
          "required": true,
          "sources": [
            {
              "stdin": "media:llm-generation-request;json;record"
            }
          ],
          "arg_description": "Request with request_type=model_info and model_spec"
        }
      ],
      "output": {
        "media_urn": "media:llm-model-info;json;record",
        "output_description": "JSON object with model metadata"
      }
    }
  },
  {
    "name": "llm-text-generation-gguf",
    "capability": {
      "urn": "cap:gguf;in=media:textable;llm;ml-model;op=generate_text;out=\"media:generated-text;textable;record\"",
      "command": "run_inference",
      "title": "Generate Text with LLM (GGUF)",
      "cap_description": "Generate text using GGUF models with llama.cpp backend",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:textable",
          "required": false,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "cli_flag": "--prompt"
            }
          ],
          "arg_description": "Input text prompt for generation"
        },
        {
          "media_urn": "media:file-path;textable",
          "required": false,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to input file containing prompt"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "GGUF model specification (HuggingFace repo or local path)",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum number of tokens to generate",
          "default_value": 512
        },
        {
          "media_urn": "media:temperature;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--temperature"
            }
          ],
          "arg_description": "Sampling temperature (0.0-2.0)",
          "default_value": 0.7
        },
        {
          "media_urn": "media:top-k;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--top-k"
            }
          ],
          "arg_description": "Top-k sampling parameter",
          "default_value": 40
        },
        {
          "media_urn": "media:top-p;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--top-p"
            }
          ],
          "arg_description": "Top-p (nucleus) sampling parameter",
          "default_value": 0.9
        },
        {
          "media_urn": "media:min-p;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--min-p"
            }
          ],
          "arg_description": "Min-p sampling parameter",
          "default_value": 0.05
        },
        {
          "media_urn": "media:seed;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--seed"
            }
          ],
          "arg_description": "Random seed for reproducibility",
          "default_value": 42
        },
        {
          "media_urn": "media:max-context-length;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-context-length"
            }
          ],
          "arg_description": "Maximum context length",
          "default_value": 4096
        },
        {
          "media_urn": "media:batch-size;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--batch-size"
            }
          ],
          "arg_description": "Batch size for processing",
          "default_value": 2048
        },
        {
          "media_urn": "media:stream-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--stream"
            }
          ],
          "arg_description": "Enable streaming output",
          "default_value": false
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Generated text with metadata including tokens and timing"
      }
    }
  },
  {
    "name": "llm-text-generation-mlx",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";llm;ml-model;mlx;op=generate_text;out=\"media:generated-text;textable;record\"",
      "command": "run_inference",
      "title": "Generate Text with LLM (MLX)",
      "cap_description": "Generate text using MLX-based LLM models on Apple Silicon",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "position": 0
            }
          ],
          "arg_description": "Path to MLX model directory or HuggingFace model ID",
          "default_value": "hf:mlx-community/Llama-3.2-3B-Instruct-4bit"
        },
        {
          "media_urn": "media:textable",
          "required": false,
          "sources": [
            {
              "stdin": "media:textable"
            },
            {
              "cli_flag": "--prompt"
            }
          ],
          "arg_description": "Input text prompt for generation"
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum number of tokens to generate",
          "default_value": 512
        },
        {
          "media_urn": "media:temperature;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--temperature"
            }
          ],
          "arg_description": "Sampling temperature (0.0-2.0)",
          "default_value": 0.7
        },
        {
          "media_urn": "media:top-p;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--top-p"
            }
          ],
          "arg_description": "Top-p (nucleus) sampling parameter",
          "default_value": 0.9
        },
        {
          "media_urn": "media:repetition-penalty;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--repetition-penalty"
            }
          ],
          "arg_description": "Repetition penalty",
          "default_value": 1.1
        },
        {
          "media_urn": "media:seed;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--seed"
            }
          ],
          "arg_description": "Random seed for reproducibility"
        },
        {
          "media_urn": "media:stream-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--stream"
            }
          ],
          "arg_description": "Enable streaming output",
          "default_value": false
        }
      ],
      "output": {
        "media_urn": "media:generated-text;textable;record",
        "output_description": "Generated text with metadata including tokens and timing"
      }
    }
  },
  {
    "name": "llm-vocab-gguf",
    "capability": {
      "urn": "cap:gguf;in=\"media:llm-generation-request;json;record\";llm;ml-model;op=llm_vocab;out=\"media:llm-vocab-response;json;record\"",
      "command": "inference",
      "title": "Get Model Vocabulary (GGUF)",
      "cap_description": "Extract vocabulary tokens from a GGUF model for constraint initialization",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:llm-generation-request;json;record",
          "required": true,
          "sources": [
            {
              "stdin": "media:llm-generation-request;json;record"
            }
          ],
          "arg_description": "Request with request_type=vocab and model_spec"
        }
      ],
      "output": {
        "media_urn": "media:llm-vocab-response;json;record",
        "output_description": "JSON object with vocab array and vocab_size"
      }
    }
  },
  {
    "name": "model-availability",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=model-availability;out=\"media:model-availability;textable;record\"",
      "command": "check",
      "title": "Check Model Availability",
      "cap_description": "Check if a model is available locally and/or remotely.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:model-spec;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Model spec to check availability for"
        }
      ],
      "output": {
        "media_urn": "media:model-availability;textable;record",
        "output_description": "Model availability information including local and remote status"
      }
    }
  },
  {
    "name": "model-contents",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=model-contents;out=\"media:model-contents;textable;record\"",
      "command": "contents",
      "title": "Model Contents",
      "cap_description": "List contents of a model repository.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:model-spec;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Model spec to list contents for"
        }
      ],
      "output": {
        "media_urn": "media:model-contents;textable;record",
        "output_description": "Model contents including files, layers, parameters and metadata"
      }
    }
  },
  {
    "name": "model-download",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=download-model;out=\"media:download-result;textable;record\"",
      "command": "download",
      "title": "Download Model",
      "cap_description": "Download a model from repository to local cache.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:model-spec;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Model spec (e.g., hf:org/model-name)"
        }
      ],
      "output": {
        "media_urn": "media:download-result;textable;record",
        "output_description": "Download result with model path and metadata"
      }
    }
  },
  {
    "name": "model-list",
    "capability": {
      "urn": "cap:in=\"media:model-repo;textable;record\";op=list-models;out=\"media:model-list;textable;record\"",
      "command": "list",
      "title": "List Models",
      "cap_description": "List all locally cached models.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-repo;textable;record",
          "required": false,
          "sources": [
            {
              "stdin": "media:model-repo;textable;record"
            }
          ]
        }
      ],
      "output": {
        "media_urn": "media:model-list;textable;record",
        "output_description": "List of models with their metadata and status"
      }
    }
  },
  {
    "name": "model-path",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=model-path;out=\"media:model-path;textable;record\"",
      "command": "path",
      "title": "Get Model Path",
      "cap_description": "Get local filesystem path to a cached model.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:model-spec;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Model spec to get path for"
        }
      ],
      "output": {
        "media_urn": "media:model-path;textable;record",
        "output_description": "Local filesystem path to the model directory"
      }
    }
  },
  {
    "name": "model-status",
    "capability": {
      "urn": "cap:in=\"media:model-spec;textable\";op=model-status;out=\"media:model-status;textable;record\"",
      "command": "status",
      "title": "Model Status",
      "cap_description": "Get download status for a model.",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:model-spec;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Model spec to check status for"
        }
      ],
      "output": {
        "media_urn": "media:model-status;textable;record",
        "output_description": "Model status including health, progress and configuration"
      }
    }
  },
  {
    "name": "query-structured-en",
    "capability": {
      "urn": "cap:constrained;in=\"media:json;json-schema;textable;record\";language=en;op=query_structured;out=\"media:json;textable;record\"",
      "command": "structured_query",
      "title": "Execute Structured Query",
      "cap_description": "Execute structured queries with JSON schema constraints and template rendering",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:query-name;textable",
          "required": true,
          "sources": [
            {
              "position": 0
            }
          ],
          "arg_description": "Name of the structured query to execute"
        },
        {
          "media_urn": "media:substitutions;textable;record",
          "required": true,
          "sources": [
            {
              "cli_flag": "--substitutions"
            }
          ],
          "arg_description": "Template substitutions for the query prompt"
        },
        {
          "media_urn": "media:language-code;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--language"
            }
          ],
          "arg_description": "Language code for the query processing",
          "default_value": "en"
        },
        {
          "media_urn": "media:schema-variables;textable;record",
          "required": false,
          "sources": [
            {
              "cli_flag": "--schema-variables"
            }
          ],
          "arg_description": "Variables for dynamic schema generation",
          "default_value": {}
        },
        {
          "media_urn": "media:callback-enabled-flag;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--callback"
            }
          ],
          "arg_description": "Whether to enable streaming callback updates",
          "default_value": false
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "Model spec to use for structured query execution",
          "default_value": "hf:MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF?include=*Q8_0*,*.json&exclude=*IQ1*,*IQ2*,*IQ3*,*Q2*,*Q3*"
        }
      ],
      "output": {
        "media_urn": "media:json;textable;record",
        "output_description": "Structured JSON response conforming to the query's schema"
      }
    }
  },
  {
    "name": "test-edge1",
    "capability": {
      "urn": "cap:in=\"media:node1;textable\";op=test_edge1;out=\"media:node2;textable\"",
      "command": "test-concat",
      "title": "Test Edge 1 (Prepend Transform)",
      "cap_description": "Transform node1 to node2 by prepending optional text argument",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:node1;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the input text file"
        },
        {
          "media_urn": "media:edge1arg1;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--prefix"
            }
          ],
          "arg_description": "Text to prepend before the input content"
        }
      ],
      "output": {
        "media_urn": "media:node2;textable",
        "output_description": "Transformed text with optional prefix prepended"
      }
    }
  },
  {
    "name": "test-edge2",
    "capability": {
      "urn": "cap:in=\"media:node2;textable\";op=test_edge2;out=\"media:node3;textable\"",
      "command": "test-concat",
      "title": "Test Edge 2 (Append Transform)",
      "cap_description": "Transform node2 to node3 by appending optional text argument",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:node2;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the intermediate text file"
        },
        {
          "media_urn": "media:edge2arg1;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--suffix"
            }
          ],
          "arg_description": "Text to append after the input content"
        }
      ],
      "output": {
        "media_urn": "media:node3;textable",
        "output_description": "Transformed text with optional suffix appended"
      }
    }
  },
  {
    "name": "test-edge3",
    "capability": {
      "urn": "cap:in=\"media:node1;textable;list\";op=test_edge3;out=\"media:node4;textable;list\"",
      "command": "test-concat",
      "title": "Test Edge 3 (Folder Fan-Out)",
      "cap_description": "Transform folder of node1 files to list of node4 items",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable;list",
          "required": true,
          "sources": [
            {
              "stdin": "media:node1;textable;list"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Paths to the input text files in folder"
        },
        {
          "media_urn": "media:edge3arg1;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--transform"
            }
          ],
          "arg_description": "Text to add to each file during fan-out"
        }
      ],
      "output": {
        "media_urn": "media:node4;textable;list",
        "output_description": "List of transformed text items"
      }
    }
  },
  {
    "name": "test-edge4",
    "capability": {
      "urn": "cap:in=\"media:node4;textable;list\";op=test_edge4;out=\"media:node5;textable\"",
      "command": "test-concat",
      "title": "Test Edge 4 (Fan-In Collect)",
      "cap_description": "Collect list of node4 items into single node5 output",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable;list",
          "required": true,
          "sources": [
            {
              "stdin": "media:node4;textable;list"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "List of text items to collect"
        },
        {
          "media_urn": "media:edge4arg1;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--separator"
            }
          ],
          "arg_description": "Separator text between collected items",
          "default_value": " "
        }
      ],
      "output": {
        "media_urn": "media:node5;textable",
        "output_description": "Single merged text from all list items"
      }
    }
  },
  {
    "name": "test-edge5",
    "capability": {
      "urn": "cap:in=\"media:node2;textable\";in2=\"media:node3;textable\";op=test_edge5;out=\"media:node5;textable\"",
      "command": "test-concat",
      "title": "Test Edge 5 (Multi-Input Merge)",
      "cap_description": "Merge node2 and node3 inputs into single node5 output",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:node2;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the first input text file (node2)"
        },
        {
          "media_urn": "media:edge5arg2;file-path;textable",
          "required": true,
          "sources": [
            {
              "position": 1
            }
          ],
          "arg_description": "Path to the second input text file (node3)"
        },
        {
          "media_urn": "media:edge5arg3;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--separator"
            }
          ],
          "arg_description": "Separator text between merged inputs",
          "default_value": " "
        }
      ],
      "output": {
        "media_urn": "media:node5;textable",
        "output_description": "Merged text from both inputs"
      }
    }
  },
  {
    "name": "test-edge6",
    "capability": {
      "urn": "cap:in=\"media:node1;textable\";op=test_edge6;out=\"media:node4;textable;list\"",
      "command": "test-concat",
      "title": "Test Edge 6 (Single to List)",
      "cap_description": "Transform single node1 input to list of node4 items",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:node1;textable"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the input text file"
        },
        {
          "media_urn": "media:edge6arg1;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--count"
            }
          ],
          "arg_description": "Number of times to duplicate input in list",
          "default_value": "1"
        },
        {
          "media_urn": "media:edge6arg2;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--item-prefix"
            }
          ],
          "arg_description": "Prefix to add to each list item"
        }
      ],
      "output": {
        "media_urn": "media:node4;textable;list",
        "output_description": "List containing input (possibly duplicated)"
      }
    }
  },
  {
    "name": "vision-describe-candle",
    "capability": {
      "urn": "cap:candle;in=\"media:image;png\";ml-model;op=describe_image;out=\"media:image-description;textable\"",
      "command": "describe_image",
      "title": "Describe Image (Candle)",
      "cap_description": "Generate image descriptions using BLIP models with Candle ML framework",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:image;png"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the image file to describe"
        },
        {
          "media_urn": "media:prompt;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--prompt"
            }
          ],
          "arg_description": "Optional prompt to guide the image description"
        },
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "BLIP model name from HuggingFace",
          "default_value": "hf:Salesforce/blip-image-captioning-large"
        }
      ],
      "output": {
        "media_urn": "media:image-description;textable",
        "output_description": "Generated text description of the image"
      }
    }
  },
  {
    "name": "vision-describe-gguf",
    "capability": {
      "urn": "cap:gguf;in=\"media:image;png\";ml-model;op=describe_image;out=\"media:image-description;textable\";vision",
      "command": "describe_image",
      "title": "Describe Image (GGUF)",
      "cap_description": "Generate detailed image descriptions using GGUF multimodal models (LLaVA, BakLLaVA) with llama.cpp backend",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model-spec"
            }
          ],
          "arg_description": "GGUF vision model specification (HuggingFace repo or local path)",
          "default_value": "hf:xtuner/llava-llama-3-8b-v1_1-gguf?include=*f16*"
        },
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:image;png"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the image file to describe"
        },
        {
          "media_urn": "media:textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--prompt"
            }
          ],
          "arg_description": "Text prompt for the image description",
          "default_value": "Describe this image in detail."
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum number of tokens to generate",
          "default_value": 256
        },
        {
          "media_urn": "media:temperature;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--temperature"
            }
          ],
          "arg_description": "Sampling temperature (0.0-2.0)",
          "default_value": 0.6
        }
      ],
      "output": {
        "media_urn": "media:image-description;textable",
        "output_description": "Text description of the image"
      }
    }
  },
  {
    "name": "vision-describe-mlx",
    "capability": {
      "urn": "cap:in=\"media:image;png\";ml-model;mlx;op=describe_image;out=\"media:image-description;textable\";vision",
      "command": "describe_image",
      "title": "Describe Image (MLX)",
      "cap_description": "Generate detailed image descriptions using MLX-based vision-language models on Apple Silicon",
      "metadata": {},
      "args": [
        {
          "media_urn": "media:model-spec;textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--model"
            }
          ],
          "arg_description": "Path to MLX vision model directory",
          "default_value": "hf:mlx-community/llava-1.5-7b-4bit"
        },
        {
          "media_urn": "media:file-path;textable",
          "required": true,
          "sources": [
            {
              "stdin": "media:image;png"
            },
            {
              "position": 0
            }
          ],
          "arg_description": "Path to the image file to describe (local path or HTTP(S) URL)"
        },
        {
          "media_urn": "media:textable",
          "required": false,
          "sources": [
            {
              "cli_flag": "--prompt"
            }
          ],
          "arg_description": "Text prompt for the image description",
          "default_value": "Describe this image in detail."
        },
        {
          "media_urn": "media:max-tokens;textable;numeric",
          "required": false,
          "sources": [
            {
              "cli_flag": "--max-tokens"
            }
          ],
          "arg_description": "Maximum number of tokens to generate",
          "default_value": 256
        }
      ],
      "output": {
        "media_urn": "media:image-description;textable",
        "output_description": "Text description of the image"
      }
    }
  }
];

/**
 * Clear all JSON files from a directory to remove stale caps
 */
function clearDestinationDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return 0;
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
    }
    return files.length;
}

async function uploadCapabilities() {
    let successCount = 0;
    let errorCount = 0;

	if (DEST_PATH) {
		// Clear destination directory first to remove stale caps
		const clearedCount = clearDestinationDirectory(DEST_PATH);
		if (clearedCount > 0) {
			console.log(`Cleared ${clearedCount} existing JSON files from ${DEST_PATH}`);
		}

		if (!fs.existsSync(DEST_PATH)) {
			fs.mkdirSync(DEST_PATH, { recursive: true });
		}

		for (const { name, capability } of capabilities) {
			const urn = formatCapUrn(capability.urn);
			try {
				// copy the generated json for cap to destination path if defined
				const filename = `${name}.json`;
				const destPath = path.join(DEST_PATH, filename);
				fs.writeFileSync(destPath, JSON.stringify(capability, null, 2));
				console.log(`   Copied to: ${destPath}`);

				successCount++;
			} catch (error) {
				console.error(`ERR Failed to copy ${urn}:`, error.message);
				errorCount++;
			}
		}
	}

    if (!ADMIN_KEY) {
        console.error('Error: CAPDAG_ADMIN_KEY or ADMIN_PASSWORD environment variable required');
        process.exit(1);
    }

    console.log('Authenticating with registry...');
    const token = await authenticate();

    console.log('Clearing existing capabilities...');
    await clearAllCapabilities(token);

    console.log('Uploading standard capabilities...');
    successCount = 0;
    errorCount = 0;

    for (const { name, capability } of capabilities) {
        const urn = formatCapUrn(capability.urn);
        try {
            await uploadCapability(token, capability);
            console.log(`OK Uploaded: ${urn}`);

            successCount++;
        } catch (error) {
            console.error(`ERR Failed to upload ${urn}:`, error.message);
            errorCount++;
        }
    }

    console.log();
    console.log(`Upload complete: ${successCount} success, ${errorCount} errors`);

    if (errorCount > 0) {
        console.error(`\nNO ERROR: Failed to upload ${errorCount} capability/capabilities.`);
        console.error('Capability uploads had errors. Check the error messages above for details.');
        console.error('Common issues: missing media URNs, validation failures, network errors.');
        process.exit(1);
    }
}

async function authenticate() {
    const data = JSON.stringify({ key: ADMIN_KEY });
    const response = await makeRequest('/api/admin/auth', 'POST', data);
    return response.token;
}

async function clearAllCapabilities(token) {
    const response = await makeRequest('/api/admin/capabilities/clear', 'POST', null, token);
    console.log(`  Cleared ${response.deleted_count} capabilities`);
    if (response.error_count > 0) {
        console.warn(`  Warning: ${response.error_count} errors during clear`);
    }
}

async function uploadCapability(token, capability) {
    const data = JSON.stringify(capability);
    await makeRequest('/api/admin/capabilities', 'POST', data, token);
}

function makeRequest(path, method, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, REGISTRY_URL);

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(url, options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const parsed = responseData ? JSON.parse(responseData) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || responseData}`));
                    }
                } catch (error) {
                    reject(new Error(`Invalid JSON response: ${responseData}`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

// Import the strict Cap URN implementation from npm package
const { CapUrn, CapUrnError } = require('capdag');

function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            // Parse and re-serialize to ensure proper formatting
            const parsed = CapUrn.fromString(capUrn);
            return parsed.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
                console.warn(`Invalid Cap URN string: ${capUrn}`, error.message);
                return 'cap:unknown';
            }
            throw error;
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Use fromTags to properly extract in/out and normalize
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
            console.warn(`Invalid Cap URN tags:`, capUrn.tags, error);
            return 'cap:unknown';
            }
            throw error;
        }
    }

    return 'cap:unknown';
}

if (require.main === module) {
    uploadCapabilities().catch(error => {
        console.error('Upload failed:', error);
        process.exit(1);
    });
}

module.exports = { uploadCapabilities, formatCapUrn };
