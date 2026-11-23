import { useTranslation } from 'react-i18next';
import { safeImgSrc } from '../../utils/safeMediaSrc';

/** The picture of a matching / ordering / categorize item; renders nothing for a missing or unsafe URL. */
export default function ItemImage({ url, alt }: { url?: string; alt?: string }) {
    const { t } = useTranslation();
    const src = safeImgSrc(url);
    if (!src) return null;
    return (
        <img
            src={src}
            alt={alt ?? t('tests.taking.option_image_fallback')}
            style={{ maxWidth: 80, maxHeight: 60, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }}
        />
    );
}
