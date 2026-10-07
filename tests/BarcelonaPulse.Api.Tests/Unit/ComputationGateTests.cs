using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Tests.Unit;

/// <summary>Cuántos cálculos a la vez y cuánto se espera un hueco antes de rendirse.</summary>
public sealed class ComputationGateTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Beyond_the_concurrency_a_request_waits_at_most_the_limit_and_then_gives_up()
    {
        var gate = new ComputationGate(1, TimeSpan.FromMilliseconds(150));
        var first = await gate.EnterAsync(Ct);
        var busy = await Assert.ThrowsAsync<ComputationBusyException>(() => gate.EnterAsync(Ct));
        Assert.Equal(1, busy.RetryAfterSeconds);

        // Al liberar el hueco, la siguiente entra; soltarlo dos veces no abre otro.
        first.Dispose();
        first.Dispose();
        using var second = await gate.EnterAsync(Ct);
        await Assert.ThrowsAsync<ComputationBusyException>(() => gate.EnterAsync(Ct));
    }

    [Fact]
    public async Task A_caller_may_wait_longer_than_the_gate_default()
    {
        var gate = new ComputationGate(1, TimeSpan.FromMilliseconds(50));
        var first = await gate.EnterAsync(Ct);
        var waiting = gate.EnterAsync(Ct, TimeSpan.FromSeconds(5));
        await Task.Delay(200, Ct);
        Assert.False(waiting.IsCompleted);
        first.Dispose();
        using var second = await waiting;
    }

    [Fact]
    public void Retry_after_is_half_the_wait_and_at_least_a_second()
    {
        Assert.Equal(5, new ComputationBusyException(TimeSpan.FromSeconds(10)).RetryAfterSeconds);
        Assert.Equal(3, new ComputationBusyException(TimeSpan.FromSeconds(5)).RetryAfterSeconds);
        Assert.Equal(1, new ComputationBusyException(TimeSpan.FromMilliseconds(200)).RetryAfterSeconds);
    }
}
