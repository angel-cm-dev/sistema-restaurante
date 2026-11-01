import type { Category, Product } from '../../domain/entities';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors';
import type { CreateProductDto, UpdateProductDto } from '../dtos';
import type { Page, PageQuery } from '../pagination';
import type { UnitOfWork } from '../ports';

export class MenuService {
  constructor(private readonly uow: UnitOfWork) {}

  listCategories() {
    return this.uow.repos.menu.listCategories();
  }

  async createCategory(data: { name: string; sortOrder: number }): Promise<Category> {
    const categories = await this.uow.repos.menu.listCategories();
    if (categories.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
      throw new ConflictError(`La categoría "${data.name}" ya existe`);
    }
    return this.uow.repos.menu.createCategory(data);
  }

  listProducts(query: PageQuery & { categoryId?: number; active?: boolean }): Promise<Page<Product>> {
    return this.uow.repos.menu.listProducts(query);
  }

  async getProduct(id: number): Promise<Product> {
    const product = await this.uow.repos.menu.findProduct(id);
    if (!product) throw new NotFoundError('Producto', id);
    return product;
  }

  async createProduct(dto: CreateProductDto): Promise<Product> {
    await this.assertCategory(dto.categoryId);
    const { modifiers, ...data } = dto;
    return this.uow.transaction(async (repos) => {
      const product = await repos.menu.createProduct(data, modifiers);
      return (await repos.menu.findProduct(product.id))!;
    });
  }

  async updateProduct(id: number, dto: UpdateProductDto): Promise<Product> {
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);
    const { modifiers, ...patch } = dto;
    return this.uow.transaction(async (repos) => {
      const product = await repos.menu.updateProduct(id, patch);
      if (!product) throw new NotFoundError('Producto', id);
      // Cambiar modificadores no afecta pedidos antiguos: los ítems guardan una copia
      // (nombre y precio) del modificador elegido en el momento del pedido.
      if (modifiers) await repos.menu.replaceModifiers(id, modifiers);
      return (await repos.menu.findProduct(id))!;
    });
  }

  private async assertCategory(categoryId: number) {
    if (!(await this.uow.repos.menu.findCategory(categoryId))) {
      throw new ValidationError(`La categoría ${categoryId} no existe`);
    }
  }
}
