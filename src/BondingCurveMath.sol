// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @notice Shared, deterministic linear curve economics for launch and platform markets.
/// @dev 60% is sold on the curve and 40% is reserved for the locked V4 pool. The curve starts
///      at one third of the terminal pool price and increases linearly. Its integral equals the
///      configured graduation raise, so the last curve price matches the initial pool price.
library BondingCurveMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant CURVE_SALE_BPS = 6_000;
    uint256 internal constant WAD = 1e18;

    function allocations(uint256 totalTokens) internal pure returns (uint256 curveTokens, uint256 poolTokens) {
        curveTokens = FullMath.mulDiv(totalTokens, CURVE_SALE_BPS, BPS);
        poolTokens = totalTokens - curveTokens;
    }

    function startAndEndPriceWad(uint256 graduationQuote, uint256 curveTokens, uint256 poolTokens)
        internal
        pure
        returns (uint256 startPriceWad, uint256 endPriceWad)
    {
        if (graduationQuote == 0 || curveTokens == 0 || poolTokens == 0) return (0, 0);
        endPriceWad = FullMath.mulDiv(graduationQuote, WAD, poolTokens);
        uint256 twiceAveragePriceWad = FullMath.mulDiv(graduationQuote, 2 * WAD, curveTokens);
        if (twiceAveragePriceWad <= endPriceWad) return (0, endPriceWad);
        startPriceWad = twiceAveragePriceWad - endPriceWad;
    }

    function cumulativeQuote(
        uint256 graduationQuote,
        uint256 curveTokens,
        uint256 poolTokens,
        uint256 tokensSold
    ) internal pure returns (uint256 quote) {
        if (tokensSold == 0 || graduationQuote == 0 || curveTokens == 0 || poolTokens == 0) return 0;
        if (tokensSold >= curveTokens) return graduationQuote;

        (uint256 startPriceWad, uint256 endPriceWad) =
            startAndEndPriceWad(graduationQuote, curveTokens, poolTokens);
        if (startPriceWad == 0 || endPriceWad <= startPriceWad) return 0;

        uint256 soldFractionWad = FullMath.mulDiv(tokensSold, WAD, curveTokens);
        uint256 base = FullMath.mulDiv(startPriceWad, tokensSold, WAD);
        uint256 slopeAtFullSale = FullMath.mulDiv(endPriceWad - startPriceWad, curveTokens, WAD);
        uint256 slopeQuoteAtSold = FullMath.mulDiv(slopeAtFullSale, soldFractionWad, WAD);
        uint256 curved = FullMath.mulDiv(slopeQuoteAtSold, soldFractionWad, 2 * WAD);
        quote = base + curved;
    }

    function quoteForTokens(
        uint256 graduationQuote,
        uint256 curveTokens,
        uint256 poolTokens,
        uint256 tokensSold,
        uint256 tokensInOrOut
    ) internal pure returns (uint256) {
        if (tokensInOrOut == 0 || tokensSold >= curveTokens) return 0;
        uint256 nextSold = tokensSold + tokensInOrOut;
        if (nextSold > curveTokens) return 0;
        return cumulativeQuote(graduationQuote, curveTokens, poolTokens, nextSold)
            - cumulativeQuote(graduationQuote, curveTokens, poolTokens, tokensSold);
    }

    /// @notice Invert the linear integral and return the token amount affordable with quoteIn.
    function tokensForQuote(
        uint256 graduationQuote,
        uint256 curveTokens,
        uint256 poolTokens,
        uint256 tokensSold,
        uint256 quoteIn
    ) internal pure returns (uint256 tokensOut) {
        if (quoteIn == 0 || tokensSold >= curveTokens) return 0;
        uint256 currentQuote = cumulativeQuote(graduationQuote, curveTokens, poolTokens, tokensSold);
        uint256 quoteRemaining = graduationQuote - currentQuote;
        uint256 tokenRemaining = curveTokens - tokensSold;
        if (quoteIn >= quoteRemaining) return tokenRemaining;

        (uint256 startPriceWad, uint256 endPriceWad) =
            startAndEndPriceWad(graduationQuote, curveTokens, poolTokens);
        if (startPriceWad == 0 || endPriceWad <= startPriceWad) return 0;

        uint256 baseQuote = FullMath.mulDiv(startPriceWad, curveTokens, WAD);
        uint256 slopeQuote = FullMath.mulDiv(endPriceWad - startPriceWad, curveTokens, WAD);
        if (baseQuote == 0 || slopeQuote == 0) return 0;

        uint256 soldFractionWad = FullMath.mulDiv(tokensSold, WAD, curveTokens);
        uint256 linearCoefficient = baseQuote + FullMath.mulDiv(slopeQuote, soldFractionWad, WAD);
        uint256 discriminant = linearCoefficient * linearCoefficient + 2 * slopeQuote * quoteIn;
        uint256 root = _sqrt(discriminant);
        if (root <= linearCoefficient) return 0;

        // Stable positive root for a*d² + b*d = quoteIn, expressed as a fraction of curve supply.
        uint256 deltaFractionWad = FullMath.mulDiv(2 * quoteIn, WAD, linearCoefficient + root);
        tokensOut = FullMath.mulDiv(curveTokens, deltaFractionWad, WAD);
        if (tokensOut > tokenRemaining) tokensOut = tokenRemaining;

        // Keep integer rounding from ever quoting more curve inventory than the quote can buy.
        if (tokensOut > 0 && quoteForTokens(
            graduationQuote, curveTokens, poolTokens, tokensSold, tokensOut
        ) > quoteIn) {
            unchecked { --tokensOut; }
        }
    }

    function spotPriceWad(
        uint256 graduationQuote,
        uint256 curveTokens,
        uint256 poolTokens,
        uint256 tokensSold
    ) internal pure returns (uint256 priceWad) {
        (uint256 startPriceWad, uint256 endPriceWad) =
            startAndEndPriceWad(graduationQuote, curveTokens, poolTokens);
        if (startPriceWad == 0 || endPriceWad <= startPriceWad) return 0;
        if (tokensSold >= curveTokens) return endPriceWad;
        priceWad = startPriceWad
            + FullMath.mulDiv(endPriceWad - startPriceWad, tokensSold, curveTokens);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        uint256 x = value;
        result = (x + 1) >> 1;
        while (result < x) {
            x = result;
            result = (value / x + x) >> 1;
        }
        return x;
    }
}
