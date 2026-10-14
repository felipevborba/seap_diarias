namespace Seap.Compartilhado.Respostas;

// Mesmo envelope usado pelo CarteiraPenal: o api.js do front espera { success, message, data }.

public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public T? Data { get; set; }

    public static ApiResponse<T> SuccessResponse(T data, string message = "Operação realizada com sucesso.")
        => new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> ErrorResponse(string message)
        => new() { Success = false, Message = message, Data = default };
}

public class PagedResult<T>
{
    public const int TamanhoMaximo = 100;

    public IReadOnlyList<T> Items { get; init; } = Array.Empty<T>();
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalItems { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalItems / PageSize) : 0;

    public PagedResult() { }

    public PagedResult(IReadOnlyList<T> items, int page, int pageSize, int totalItems)
    {
        Items = items;
        Page = page;
        PageSize = pageSize;
        TotalItems = totalItems;
    }

    public static (int Page, int PageSize) Normalizar(int page, int pageSize)
        => (Math.Max(1, page), Math.Clamp(pageSize, 1, TamanhoMaximo));
}

/// <summary>Erro de regra de negócio: a mensagem é exibida ao usuário como está.</summary>
public class RegraNegocioException : Exception
{
    public RegraNegocioException(string mensagem) : base(mensagem) { }
}

/// <summary>Registro inexistente (vira 404).</summary>
public class NaoEncontradoException : Exception
{
    public NaoEncontradoException(string mensagem) : base(mensagem) { }
}
