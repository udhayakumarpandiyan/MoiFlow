declare module '@react-native-ml-kit/text-recognition' {
  export interface TextBlock {
    text: string;
    cornerPoints: Array<{x: number; y: number}>;
    frame: {x: number; y: number; width: number; height: number};
    lines: TextLine[];
  }

  export interface TextLine {
    text: string;
    cornerPoints: Array<{x: number; y: number}>;
    frame: {x: number; y: number; width: number; height: number};
    elements: TextElement[];
  }

  export interface TextElement {
    text: string;
    cornerPoints: Array<{x: number; y: number}>;
    frame: {x: number; y: number; width: number; height: number};
  }

  export interface TextRecognitionResult {
    text: string;
    blocks: TextBlock[];
  }

  interface TextRecognitionModule {
    recognize(imagePath: string): Promise<TextRecognitionResult>;
  }

  const TextRecognition: TextRecognitionModule;
  export default TextRecognition;
}
