import type { EditorModule } from '@docx-editor.dev/core';
import { commentAnchorsOfStory, commentItemsOf, commentsOfPart, threadStateOfPart } from '@docx-editor.dev/core/store';

/** Feed live OOXML anchors into the engine's selection and highlight layer.
 * Using model ranges keeps repeated words, cross-paragraph anchors and edits exact.
 * Comment presentation remains owned by WMPS; no document content is rewritten.
 */
export const wordReviewModules: readonly EditorModule[] = [{
  id: 'wmps-comments',
  review: {
    displayModes: ['proposed'],
    collectReviewItems: input => commentItemsOf(
      input.commentsPart ? commentsOfPart(input.commentsPart) : [],
      [input.storyPart, ...(input.furnitureParts || [])].flatMap(commentAnchorsOfStory),
      input.commentsExtendedPart ? threadStateOfPart(input.commentsExtendedPart) : new Map()
    ).map(item => {
      const range = item.range;
      // A collapsed range has a position, but no sentence to highlight.
      return !range || item.orphaned || (range.start.paragraphId === range.end.paragraphId && range.start.offset === range.end.offset)
        ? { ...item, range: null, orphaned: true } : item;
    }),
    revisionItemsOfParagraph: () => []
  }
}];
