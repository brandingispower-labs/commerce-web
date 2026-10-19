// lib/medusa/types.ts — commerce-api(Medusa v2) 응답과 화면이 쓰는 도메인 타입.
// 위쪽 절반은 화면이 import 하는 타입이고(lib/shopify/types.ts 와 같은 이름 · 같은 필드),
// 아래쪽 절반은 Medusa 응답에서 실제로 읽는 필드만 좁혀 둔 타입이다.

export type SEO = {
  title: string;
  description: string;
};

export type Money = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
};

export type Menu = {
  title: string;
  path: string;
};

export type ProductOption = {
  id: string;
  name: string;
  values: string[];
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
};

export type Product = {
  id: string;
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  options: ProductOption[];
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  variants: ProductVariant[];
  featuredImage: Image;
  images: Image[];
  seo: SEO;
  tags: string[];
  updatedAt: string;
};

export type Collection = {
  handle: string;
  title: string;
  description: string;
  seo: SEO;
  updatedAt: string;
  path: string;
};

export type CartProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage: Image;
};

export type CartItem = {
  id: string | undefined;
  quantity: number;
  cost: {
    totalAmount: Money;
  };
  merchandise: {
    id: string;
    title: string;
    selectedOptions: {
      name: string;
      value: string;
    }[];
    product: CartProduct;
  };
};

export type Cart = {
  id: string | undefined;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  lines: CartItem[];
  totalQuantity: number;
};

export type Page = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo?: SEO;
  createdAt: string;
  updatedAt: string;
};

// --- 여기부터는 Medusa Store API 응답 쪽 타입이다. ---
// SDK 의 HttpTypes 는 버전마다 필드가 늘어난다. 화면이 실제로 읽는 필드만 여기에 적고,
// 변환 함수(lib/medusa/index.ts 의 reshape*)가 이 타입으로 한 번만 좁힌다.

export type MedusaImage = {
  id?: string;
  url: string;
};

export type MedusaOptionValue = {
  id?: string;
  value: string;
  option_id?: string | null;
  option?: { id?: string; title?: string } | null;
};

export type MedusaProductOption = {
  id: string;
  title: string;
  values?: { id?: string; value: string }[] | null;
};

export type MedusaCalculatedPrice = {
  calculated_amount?: number | null;
  currency_code?: string | null;
};

export type MedusaVariant = {
  id: string;
  title?: string | null;
  manage_inventory?: boolean | null;
  allow_backorder?: boolean | null;
  inventory_quantity?: number | null;
  options?: MedusaOptionValue[] | null;
  calculated_price?: MedusaCalculatedPrice | null;
};

export type MedusaProduct = {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  images?: MedusaImage[] | null;
  options?: MedusaProductOption[] | null;
  variants?: MedusaVariant[] | null;
  categories?: { id: string; handle: string; name: string }[] | null;
  tags?: { id?: string; value?: string }[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MedusaCategory = {
  id: string;
  name: string;
  handle: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MedusaRegion = {
  id: string;
  name: string;
  currency_code: string;
};

export type MedusaLineItem = {
  id: string;
  quantity: number;
  title?: string | null;
  thumbnail?: string | null;
  unit_price?: number | null;
  total?: number | null;
  product_id?: string | null;
  product_title?: string | null;
  product_handle?: string | null;
  variant_id?: string | null;
  variant_title?: string | null;
  variant_option_values?: Record<string, unknown> | null;
  variant?: { id: string; options?: MedusaOptionValue[] | null } | null;
};

export type MedusaCart = {
  id: string;
  currency_code: string;
  total?: number | null;
  subtotal?: number | null;
  tax_total?: number | null;
  items?: MedusaLineItem[] | null;
};
